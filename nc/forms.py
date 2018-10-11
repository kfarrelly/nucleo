import base64, dateutil.parser, requests

from allauth.account import forms as allauth_account_forms
from allauth.account.adapter import get_adapter
from allauth.utils import build_absolute_uri

from betterforms import multiform

from collections import OrderedDict

from django import forms
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.sites.shortcuts import get_current_site
from django.core import signing
from django.core.exceptions import ObjectDoesNotExist, ValidationError
from django.urls import reverse
from django.utils.translation import ugettext_lazy as _

from stellar_base.address import Address
from stellar_base.asset import Asset as StellarAsset
from stellar_base.memo import TextMemo
from stellar_base.operation import CreateAccount, ManageData
from stellar_base.stellarxdr import Xdr
from stellar_base.transaction import Transaction
from stellar_base.transaction_envelope import TransactionEnvelope as Te
from stellar_base.utils import AccountNotExistError

from stream_django.feed_manager import feed_manager

from .models import Account, Asset, Profile, AccountFundRequest


# Allauth
class SignupForm(allauth_account_forms.SignupForm):
    """
    Override of allauth SignupForm.
    """
    def __init__(self, *args, **kwargs):
        """
        Override __init__ to store reCAPTCHA response.
        """
        self.recaptcha_response = kwargs.pop('g-recaptcha-response')
        super(SignupForm, self).__init__(*args, **kwargs)

    def clean(self):
        """
        Override to validate reCAPTCHA before saving.
        """
        # Call the super
        super(SignupForm, self).clean()
        # POST to the reCAPTCHA verification endpoint
        data = {
            'secret': settings.GOOGLE_RECAPTCHA_SECRET_KEY,
            'response': self.recaptcha_response
        }
        r = requests.post(settings.GOOGLE_RECAPTCHA_VERIFICATION_URL, data=data)
        if not r.json().get('success'):
            raise ValidationError(_('reCAPTCHA invalid. Please verify you are not a robot.'))


# nc
class UserUpdateForm(forms.ModelForm):
    class Meta:
        model = get_user_model()
        fields = ['first_name', 'last_name']
        widgets = {
            'first_name': forms.TextInput(attrs={'placeholder': 'First name'}),
            'last_name': forms.TextInput(attrs={'placeholder': 'Last name'}),
        }


class ProfileUpdateForm(forms.ModelForm):
    class Meta:
        model = Profile
        fields = [ 'bio', 'pic', 'cover' ]
        widgets = {
            'bio': forms.TextInput(attrs={'placeholder': 'Bio'}),
        }


class ProfileWithPrivacyUpdateForm(forms.ModelForm):
    class Meta:
        model = Profile
        fields = [ 'bio', 'pic', 'cover', 'is_private' ]
        widgets = {
            'bio': forms.TextInput(attrs={'placeholder': 'Bio'}),
        }
        labels = {
            'is_private': _('Private profile'),
        }
        help_texts = {
            'is_private': _("When your profile is private, only people you approve to follow you can see your Stellar account info, public keys, assets and balances."),
        }


class UserProfileUpdateMultiForm(multiform.MultiModelForm):
    form_classes = OrderedDict((
        ('user', UserUpdateForm),
        ('profile', ProfileUpdateForm),
    ))


class UserProfileWithPrivacyUpdateMultiForm(multiform.MultiModelForm):
    form_classes = OrderedDict((
        ('user', UserUpdateForm),
        ('profile', ProfileWithPrivacyUpdateForm),
    ))


class ProfileEmailSettingsUpdateForm(forms.ModelForm):
    class Meta:
        model = Profile
        fields = [ 'allow_payment_email', 'allow_token_issuance_email', 'allow_trust_email',
            'allow_trade_email', 'allow_follower_email' ]
        labels = {
            'allow_payment_email': _('Payments'),
            'allow_token_issuance_email': _('New tokens'),
            'allow_trust_email': _('Asset trusts'),
            'allow_trade_email': _('Trades'),
            'allow_follower_email': _('Follow requests'),
        }
        help_texts = {
            'allow_payment_email': _('Receive email notification when someone sends you a payment.'),
            'allow_token_issuance_email': _('Receive email notification when someone you follow issues a new token.'),
            'allow_trust_email': _("Receive email notification when someone trusts a token you've issued."),
            'allow_trade_email': _('Receive email notification when someone you follow buys/sells an asset.'),
            'allow_follower_email': _('Receive email notification when someone requests to follow you.'),
        }


class ProfilePrivacySettingsUpdateForm(forms.ModelForm):
    class Meta:
        model = Profile
        fields = [ 'is_private' ]
        labels = {
            'is_private': _('Private profile'),
        }
        help_texts = {
            'is_private': _("When your profile is private, only people you approve to follow you can see your Stellar account info, public keys, assets and balances."),
        }


class ProfileSettingsUpdateMultiForm(multiform.MultiModelForm):
    form_classes = {
        'email': ProfileEmailSettingsUpdateForm,
        'privacy': ProfilePrivacySettingsUpdateForm,
    }


class UserFollowUpdateForm(forms.ModelForm):
    following = forms.BooleanField()

    def save(self):
        pass

    class Meta:
        model = get_user_model()
        fields = ['following']


class UserFollowRequestUpdateForm(forms.ModelForm):
    requested = forms.BooleanField()

    def save(self):
        pass

    class Meta:
        model = get_user_model()
        fields = ['requested']


class AccountFundRequestCreateForm(forms.ModelForm):
    public_key = forms.CharField(max_length=56)

    def __init__(self, *args, **kwargs):
        """
        Override __init__ to store authenticated user
        """
        self.request = kwargs.pop('request', None)
        self.request_user = getattr(self.request, 'user', None)
        super(AccountFundRequestCreateForm, self).__init__(*args, **kwargs)

    def clean(self):
        """
        Override to check for account quota, profile pic, and if has outstanding
        funding request. If all checks out, send an email to admin notifying of
        new funding request.
        """
        # Call the super
        super(AccountFundRequestCreateForm, self).clean()

        # Obtain form input parameters
        public_key = self.cleaned_data.get("public_key")
        profile = self.request_user.profile

        # Check the quota hasn't been reached
        if profile.accounts_created + 1 > settings.STELLAR_CREATE_ACCOUNT_QUOTA:
            raise ValidationError(_("Nucleo only funds {0} new Stellar account{1} per user. You can pay to add more accounts using funds from your current accounts".format(
                settings.STELLAR_CREATE_ACCOUNT_QUOTA, 's' if settings.STELLAR_CREATE_ACCOUNT_QUOTA > 1 else ''
            )), code='invalid_quota_amount')
        # Check user doesn't already have an outstanding funding request
        elif self.request_user.requests_to_fund_account.count() > 0:
            raise ValidationError(_('Outstanding funding request still pending approval.'))

        # Send a bulk email to all the Nucleo admins
        recipient_list = [ u.email for u in get_user_model().objects\
            .filter(is_superuser=True) ]
        profile_path = reverse('nc:user-detail', kwargs={'slug': self.request_user.username})
        profile_url = build_absolute_uri(self.request, profile_path)
        create_account_path = reverse('nc:account-create')
        create_account_url = build_absolute_uri(self.request, create_account_path)
        current_site = get_current_site(self.request)
        email_settings_path = reverse('nc:user-settings-redirect')
        email_settings_url = build_absolute_uri(self.request, email_settings_path)
        ctx_email = {
            'current_site': current_site,
            'username': self.request_user.username,
            'create_account_url': create_account_url,
            'account_public_key': public_key,
            'profile_url': profile_url,
            'email_settings_url': email_settings_url,
        }
        get_adapter(self.request).send_mail_to_many('nc/email/account_fund_request',
            recipient_list, ctx_email)

        # Return cleaned data
        return self.cleaned_data

    class Meta:
        model = AccountFundRequest
        fields = ['public_key']
        widgets = {
            'public_key': forms.TextInput(attrs={'id': 'id_account_request_public_key'}),
        }


class AccountCreateForm(forms.ModelForm):
    """
    Form to either associate an existing Stellar account in Nucleo db OR
    create a new Stellar account entirely.

    If creating_stellar=True, then should fund a new Stellar account if this
    user has created fewer accounts than their allowed quota.
    """
    creating_stellar = forms.BooleanField(required=False)

    def __init__(self, *args, **kwargs):
        """
        Override __init__ to store authenticated user and initialize
        account_user variable.
        """
        self.request = kwargs.pop('request', None)
        self.request_user = getattr(self.request, 'user', None)
        self.account_user = None # NOTE: account_user is the user we're associating with the account creating in our db
        super(AccountCreateForm, self).__init__(*args, **kwargs)

    def clean(self):
        """
        Override to verify Stellar account using Data Entry added client-side.
        Decoded data entry must match request.user.id
        """
        # TODO: HANDLE THE RAISED ERRORS TO OUTPUT A VALIDATION ERROR (WORRY ABOUT TAMPERED WITH SIGNATURE ERROR)

        # Call the super
        super(AccountCreateForm, self).clean()

        # Obtain form input parameters
        creating_stellar = self.cleaned_data.get("creating_stellar")
        public_key = self.cleaned_data.get("public_key")

        if creating_stellar:
            # Creating a new Stellar account
            # NOTE: https://stellar-base.readthedocs.io/en/latest/quickstart.html#create-an-account
            request_user = self.request_user

            # Check current request user is an admin allowed to approve funding
            if not request_user.is_superuser:
                raise ValidationError(_('Invalid request. You must be an admin to approve funding of new accounts.'))
            # Check that account for this public key does not already exist
            elif Account.objects.filter(public_key=public_key).exists():
                raise ValidationError(_('Invalid public key. This account has already been funded.'))

            # Check that a funding request exists for this public key and fetch it
            try:
                funding_request = AccountFundRequest.objects.get(public_key=public_key)
            except ObjectDoesNotExist:
                funding_request = None
                raise ValidationError(_('Funding request for this public key does not exist.'))

            # Make a call to Horizon to fund new account with Nucleo base account
            horizon = settings.STELLAR_HORIZON_INITIALIZATION_METHOD()

            # Assemble the CreateAccount operation
            amount = settings.STELLAR_CREATE_ACCOUNT_MINIMUM_BALANCE
            memo = TextMemo('Nucleo Created Account')
            op_create = CreateAccount({
                'destination': public_key,
                'starting_balance': amount,
            })

            # Get the current sequence of the source account by contacting Horizon.
            # TODO: You should also check the response for errors!
            sequence = horizon.account(settings.STELLAR_BASE_KEY_PAIR.address()).get('sequence')

            # Create a transaction with our single create account operation, with the
            # default fee of 100 stroops as of this writing (0.00001 XLM)
            tx = Transaction(
                source=settings.STELLAR_BASE_KEY_PAIR.address().decode(),
                opts={
                    'sequence': sequence,
                    'memo': memo,
                    'operations': [ op_create ],
                },
            )

            # Build a transaction envelope, ready to be signed.
            envelope = Te(tx=tx, opts={"network_id": settings.STELLAR_NETWORK})

            # Sign the transaction envelope with the source keypair
            envelope.sign(settings.STELLAR_BASE_KEY_PAIR)

            # Submit the transaction to Horizon
            # TODO: Make sure to look at the response body carefully, as it can be an error or a successful response.
            te_xdr = envelope.xdr()
            response = horizon.submit(te_xdr)

            # Check whether account actually created on ledger
            if 'hash' not in response:
                raise ValidationError(_('Nucleo was not able to create a Stellar account at this time'))

            # If successful, increment the user's account quota val by one
            user_funding = funding_request.requester
            self.account_user = user_funding
            profile_funding = user_funding.profile
            profile_funding.accounts_created += 1
            profile_funding.save()

            # Delete the funding request
            funding_request.delete()

            # Email the requester to notify them of approved funding for new account
            profile_path = reverse('nc:user-detail', kwargs={'slug': user_funding.username})
            profile_url = build_absolute_uri(self.request, profile_path)
            current_site = get_current_site(self.request)
            email_settings_path = reverse('nc:user-settings-redirect')
            email_settings_url = build_absolute_uri(self.request, email_settings_path)
            ctx_email = {
                'current_site': current_site,
                'username': user_funding.username,
                'account_public_key': public_key,
                'profile_url': profile_url,
                'email_settings_url': email_settings_url,
            }
            get_adapter(self.request).send_mail('nc/email/account_create',
                user_funding.email, ctx_email)
        else:
            # Verify Stellar public key with the added Data Entry

            # Get the Stellar account for given public key
            # NOTE: Need to decouple Address initialization from get() method to work!
            address = Address(address=public_key, network=settings.STELLAR_NETWORK)
            try:
                address.get()
            except AccountNotExistError:
                raise ValidationError(_('Invalid account. Stellar Account associated with given public key does not exist.'), code='invalid_account')

            # Obtain the signed_user data entry
            signed_user = address.data.get(settings.STELLAR_DATA_VERIFICATION_KEY, None)

            if not signed_user:
                raise ValidationError(_('Invalid data entry. Decoded Stellar Data Entry does not exist.'), code='invalid_data_entry')

            # Now decode and verify data
            self.loaded_user_id = signing.loads(base64.b64decode(signed_user))
            if self.request_user.id != self.loaded_user_id:
                raise ValidationError(_('Invalid user id. Decoded Stellar Data Entry does not match your user id.'), code='invalid_user')

            # Associate request user with this account
            self.account_user = self.request_user

            # Delete any existing funding request associated with that key
            AccountFundRequest.objects.filter(public_key=public_key).delete()

            # TODO: SEND EMAIL IF KEY HAS BEEN COMPROMISED, SOMEHOW ALLOW UNFUNDED ACCOUNTS TO BE SEEN?

        return self.cleaned_data

    class Meta:
        model = Account
        fields = ['public_key', 'name', 'creating_stellar']
        widgets = {
            'public_key': forms.TextInput(attrs={'id': 'id_account_public_key'}),
        }


class AccountUpdateForm(forms.ModelForm):
    class Meta:
        model = Account
        fields = ['name', 'pic']
        widgets = {
            'name': forms.TextInput(attrs={'placeholder': 'Account name'}),
        }


class AssetUpdateForm(forms.ModelForm):
    class Meta:
        model = Asset
        fields = [ 'pic', 'cover', 'whitepaper' ]
        widgets = {
            'name': forms.TextInput(attrs={'placeholder': 'A name for the token (e.x. Nucleon)'}),
            'description': forms.TextInput(attrs={'placeholder': 'A description explaining the token purpose'}),
            'conditions': forms.TextInput(attrs={'placeholder': 'Conditions on the token (e.x. There will only ever be 500 million Nucleons)'}),
            'domain': forms.TextInput(attrs={'placeholder': 'example.com'}),
        }


class FeedActivityCreateForm(forms.Form):
    """
    Form to add new activity to request.user's feed.
    """
    tx_hash = forms.CharField(max_length=64)

    def __init__(self, *args, **kwargs):
        """
        Override __init__ to store authenticated user
        """
        self.request = kwargs.pop('request', None)
        self.request_user = self.request.user if self.request else None
        self.success_url = kwargs.pop('success_url', None)
        super(FeedActivityCreateForm, self).__init__(*args, **kwargs)

    def clean(self):
        """
        Override to obtain transaction details from given tx_hash.
        """
        # Call the super
        super(FeedActivityCreateForm, self).clean()

        # Obtain form input parameter
        tx_hash = self.cleaned_data.get("tx_hash")

        # Make calls to Horizon to get tx and all ops associated with given tx hash
        horizon = settings.STELLAR_HORIZON_INITIALIZATION_METHOD()
        tx_json = horizon.transaction(tx_hash=tx_hash)
        ops_json = horizon.transaction_operations(tx_hash=tx_hash)

        # Store the memo if there
        self.memo = tx_json['memo'] if 'memo' in tx_json and tx_json['memo_type'] != "none" else ""

        # Store the ops for save method and verify source account
        self.ops = ops_json['_embedded']['records'] if '_embedded' in ops_json and 'records' in ops_json['_embedded'] else None

        # Store the time created and check current user has added account associated with tx
        # TODO: Sometimes the transaction_operations() call returns a 404
        # for some reason (tx not settling in time?) after POSTing. Eventually
        # create a listener for txs that POSTs to this endpoint after checking
        # if an associated account is a part of the tx. Instead of current way
        # of doing in request/response cycle.
        if self.ops:
            first_op = self.ops[0]
            self.time = dateutil.parser.parse(first_op['created_at'])
            self.tx_href = first_op['_links']['transaction']['href'] if '_links' in first_op and 'transaction' in first_op['_links'] and 'href' in first_op['_links']['transaction'] else None

            try:
                self.account = self.request_user.accounts.get(public_key=first_op['source_account'])
            except ObjectDoesNotExist:
                raise ValidationError(_('Invalid user id. Decoded account associated with Stellar transaction does not match your user id.'), code='invalid_user')

        # Retrieve and store stream feed of current user
        self.feed = feed_manager.get_feed(settings.STREAM_USER_FEED, self.request_user.id)

        return self.cleaned_data

    def save(self):
        """
        Add new activity associated with given tx ops to request_user
        stream feed.

        Activity types we send to stream:
            1. Payments (verb: send)
            2. Token issuance (verb: issue)
            3. Trusting of asset (verb: trust)
            4. Buy/sell of asset (verb: offer)
            5. Follow user (verb: follow; not handled by this form but
                instead in UserFollowUpdateView)

        For verb = 'follow', 'send' should trigger email(s)/notif(s) to only
        recipient of the action. For verb = 'issue', 'offer' send email(s)/notif(s)
        to all followers of the activity actor.
        """
        if not self.ops:
            # TODO: This is a band-aid for times when tx_ops call gives a 404,
            # which seems to happen most often on offers (settlement time?).
            # Get rid of this once implement a transaction_operations nodejs listener?
            return { 'activity': None, 'success_url': self.success_url }

        # Determine activity type and update kwargs for stream call
        request_user_profile = self.request_user.profile
        current_site = get_current_site(self.request)
        tx_hash = self.cleaned_data.get("tx_hash")
        kwargs = {
            'actor': self.request_user.id,
            'actor_username': self.request_user.username,
            'actor_pic_url': request_user_profile.pic_url(),
            'actor_href': request_user_profile.href(),
            'tx_hash': self.cleaned_data.get("tx_hash"),
            'tx_href': self.tx_href,
            'foreign_id': tx_hash,
            'memo': self.memo,
            'time': self.time,
        }

        # Payment
        if len(self.ops) == 1 and self.ops[0]['type_i'] == Xdr.const.PAYMENT:
            record = self.ops[0]

            # Get the user associated with to account if registered in our db
            try:
                object = get_user_model().objects.get(accounts__public_key=record['to'])
            except ObjectDoesNotExist:
                object = None
            object_id = object.id if object else record['to'] # NOTE: if no Nucleo user has that account, use public_key for object_id in r
            object_username = object.username if object else None
            object_email = object.email if object else None

            object_profile = object.profile if object else None
            object_pic_url = object_profile.pic_url() if object_profile else None
            object_href = object_profile.href() if object_profile else None

            # Get the details of asset sent if registered in our db
            try:
                asset_id = '{0}-{1}'.format(record['asset_code'], record['asset_issuer'])\
                    if record['asset_type'] != 'native' else 'XLM-native'
                asset = Asset.objects.get(asset_id=asset_id)
            except ObjectDoesNotExist:
                asset = None
            asset_pic_url = asset.pic_url() if asset else None
            asset_href = asset.href() if asset else None

            kwargs.update({
                'verb': 'send',
                'asset_type': record['asset_type'],
                'asset_code': record.get('asset_code', None),
                'asset_issuer': record.get('asset_issuer', None),
                'asset_pic_url': asset_pic_url,
                'asset_href': asset_href,
                'amount': record['amount'],
                'object': object_id,
                'object_username': object_username,
                'object_pic_url': object_pic_url,
                'object_href': object_href
            })

            # Send an email to user receiving funds
            if object_email and object_profile and object_profile.allow_payment_email:
                object_account = object.accounts.get(public_key=record['to'])
                asset_display = record['asset_code'] if record['asset_type'] != 'native' else 'XLM'
                profile_path = reverse('nc:user-detail', kwargs={'slug': object_username})
                profile_url = build_absolute_uri(self.request, profile_path)
                email_settings_path = reverse('nc:user-settings-redirect')
                email_settings_url = build_absolute_uri(self.request, email_settings_path)
                ctx_email = {
                    'current_site': current_site,
                    'username': self.request_user.username,
                    'amount': record['amount'],
                    'asset': asset_display,
                    'memo': self.memo,
                    'account_name': object_account.name,
                    'account_public_key': object_account.public_key,
                    'profile_url': profile_url,
                    'email_settings_url': email_settings_url,
                }
                get_adapter(self.request).send_mail('nc/email/feed_activity_send',
                    object_email, ctx_email)

        # Token issuance
        elif len(self.ops) == 3 and self.ops[0]['type_i'] == Xdr.const.CHANGE_TRUST\
            and self.ops[1]['type_i'] == Xdr.const.PAYMENT\
            and self.ops[0]['asset_code'] == self.ops[1]['asset_code']\
            and self.ops[0]['asset_issuer'] == self.ops[1]['asset_issuer']:
            payment_record = self.ops[1]

            # Get account for issuer and either retrieve or create new asset in our db
            issuer = self.request_user.accounts.get(public_key=payment_record['source_account'])
            asset, created = Asset.objects.get_or_create(
                code=payment_record['asset_code'],
                issuer_address=payment_record['asset_issuer'],
                issuer=issuer
            )

            # Set the kwargs for feed activity
            kwargs.update({
                'verb': 'issue',
                'amount': payment_record['amount'],
                'object': asset.id,
                'object_type': asset.type(),
                'object_code': asset.code,
                'object_issuer': asset.issuer_address,
                'object_pic_url': asset.pic_url(),
                'object_href': asset.href()
            })

            # Send a bulk email to all followers that a new token has been issued
            recipient_list = [ u.email for u in request_user_profile.followers\
                .filter(profile__allow_token_issuance_email=True) ]
            asset_path = reverse('nc:asset-detail', kwargs={'slug': asset.asset_id})
            asset_url = build_absolute_uri(self.request, asset_path)
            email_settings_path = reverse('nc:user-settings-redirect')
            email_settings_url = build_absolute_uri(self.request, email_settings_path)
            ctx_email = {
                'current_site': current_site,
                'username': self.request_user.username,
                'amount': payment_record['amount'],
                'asset': asset.code,
                'asset_url': asset_url,
                'account_name': issuer.name,
                'account_public_key': issuer.public_key,
                'email_settings_url': email_settings_url,
            }
            get_adapter(self.request).send_mail_to_many('nc/email/feed_activity_issue',
                recipient_list, ctx_email)

        # Trusting of asset
        elif len(self.ops) == 1 and self.ops[0]['type_i'] == Xdr.const.CHANGE_TRUST:
            record = self.ops[0]

            # Get account for issuer and either retrieve or create new asset in our db
            asset, created = Asset.objects.get_or_create(
                code=record['asset_code'],
                issuer_address=record['asset_issuer']
            )

            # Set the redirect URL to the asset detail page
            if not self.success_url:
                trust_path = reverse('nc:asset-trust-list', kwargs={'slug': asset.asset_id})
                trust_url = build_absolute_uri(self.request, trust_path)
                self.success_url = trust_url

            # Test for whether adding/removing trust
            if float(self.ops[0]['limit']) == 0.0:
                # Removing trust, so don't add an activity, but remove from
                # user's asset trusting list.
                self.account.assets_trusting.remove(asset)
                if not self.request_user.accounts.filter(assets_trusting=asset).exists():
                    self.request_user.assets_trusting.remove(asset)
                return { 'activity': None, 'success_url': self.success_url }
            else:
                # Adding trust, so add activity and add to user's asset trusting list.
                self.account.assets_trusting.add(asset)
                self.request_user.assets_trusting.add(asset)

                # Set the kwargs for feed activity
                kwargs.update({
                    'verb': 'trust',
                    'object': asset.id,
                    'object_type': asset.type(),
                    'object_code': asset.code,
                    'object_issuer': asset.issuer_address,
                    'object_pic_url': asset.pic_url(),
                    'object_href': asset.href()
                })

                # Send an email to issuer of asset
                asset_issuer_account = asset.issuer
                asset_issuer_user = asset.issuer.user if asset_issuer_account else None
                asset_issuer_profile = asset_issuer_user.profile if asset_issuer_user else None
                if asset_issuer_account and asset_issuer_user and asset_issuer_profile and asset_issuer_profile.allow_trust_email:
                    asset_display = record['asset_code']
                    profile_path = reverse('nc:user-detail', kwargs={'slug': self.request_user.username})
                    profile_url = build_absolute_uri(self.request, profile_path)
                    email_settings_path = reverse('nc:user-settings-redirect')
                    email_settings_url = build_absolute_uri(self.request, email_settings_path)
                    ctx_email = {
                        'current_site': current_site,
                        'username': self.request_user.username,
                        'asset': asset_display,
                        'account_name': asset_issuer_account.name,
                        'account_public_key': asset_issuer_account.public_key,
                        'profile_url': profile_url,
                        'email_settings_url': email_settings_url,
                    }
                    get_adapter(self.request).send_mail('nc/email/feed_activity_trust',
                        asset_issuer_user.email, ctx_email)

        # Buy/sell of asset
        elif len(self.ops) == 1 and self.ops[0]['type_i'] == Xdr.const.MANAGE_OFFER:
            record = self.ops[0]

            # Given we only allow buying/selling of token with respect to XLM,
            # the offer_type is the non-XLM side.
            # TODO: Generalize for non XLM related offers
            offer_type = 'buying' if record['buying_asset_type'] != 'native' else 'selling'

            # Get account for issuer and either retrieve or create new asset in our db
            asset, created = Asset.objects.get_or_create(
                code=record[offer_type + '_asset_code'],
                issuer_address=record[offer_type + '_asset_issuer']
            )

            # Set the kwargs for feed activity
            kwargs.update({
                'verb': 'offer',
                'offer_type': offer_type,
                'amount': record['amount'],
                'price': record['price'],
                'object': asset.id,
                'object_type': asset.type(),
                'object_code': asset.code,
                'object_issuer': asset.issuer_address,
                'object_pic_url': asset.pic_url(),
                'object_href': asset.href()
            })

            # Send a bulk email to all followers that user has made a trade
            recipient_list = [ u.email for u in request_user_profile.followers\
                .filter(profile__allow_trade_email=True) ]
            offer_type_display = 'buy' if record['buying_asset_type'] != 'native' else 'sell'
            amount_display = str(float(record['price']) * float(record['amount'])) if offer_type == 'buying' else record['amount']
            price_display = str(round(1/float(record['price']), 7)) if offer_type == 'buying' else record['price']
            asset_path = reverse('nc:asset-detail', kwargs={'slug': asset.asset_id})
            asset_url = build_absolute_uri(self.request, asset_path)
            email_settings_path = reverse('nc:user-settings-redirect')
            email_settings_url = build_absolute_uri(self.request, email_settings_path)
            ctx_email = {
                'current_site': current_site,
                'username': self.request_user.username,
                'offer_type': offer_type_display,
                'amount': amount_display,
                'memo': self.memo,
                'price': price_display,
                'asset': asset.code,
                'asset_url': asset_url,
                'email_settings_url': email_settings_url,
            }
            get_adapter(self.request).send_mail_to_many('nc/email/feed_activity_offer',
                recipient_list, ctx_email)

            # Set the redirect URL to the asset detail page
            if not self.success_url:
                self.success_url = asset_url

        else:
            # Not a supported activity type
            return { 'activity': None, 'success_url': self.success_url }

        return {
            'activity': self.feed.add_activity(kwargs),
            'success_url': self.success_url,
        }
