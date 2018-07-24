import base64

from betterforms import multiform

from collections import OrderedDict

from django import forms
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core import signing
from django.core.exceptions import ValidationError
from django.utils.translation import ugettext_lazy as _

from stellar_base.address import Address
from stellar_base.asset import Asset as StellarAsset
from stellar_base.memo import TextMemo
from stellar_base.operation import CreateAccount
from stellar_base.stellarxdr import Xdr
from stellar_base.transaction import Transaction
from stellar_base.transaction_envelope import TransactionEnvelope as Te

from stream_django.feed_manager import feed_manager

from .models import Account, Asset, Profile


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


class UserProfileUpdateMultiForm(multiform.MultiModelForm):
    form_classes = OrderedDict((
        ('user', UserUpdateForm),
        ('profile', ProfileUpdateForm),
    ))


class UserFollowUpdateForm(forms.ModelForm):
    following = forms.BooleanField()

    def save(self):
        pass

    class Meta:
        model = get_user_model()
        fields = ['following']


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
        Override __init__ to store authenticated user
        """
        self.request_user = kwargs.pop('request_user', None)
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
            user = self.request_user
            profile = user.profile

            # Check the quota hasn't been reached
            if profile.accounts_created + 1 > settings.STELLAR_CREATE_ACCOUNT_QUOTA:
                raise ValidationError(_('Your created accounts quota has been reached. Nucleo only funds {0} new Stellar account{1} per user.'.format(
                    settings.STELLAR_CREATE_ACCOUNT_QUOTA, 's' if settings.STELLAR_CREATE_ACCOUNT_QUOTA > 1 else ''
                )), code='invalid_quota_amount')

            # Make a call to Horizon to fund new account with Nucleo base account
            horizon = settings.STELLAR_HORIZON_INITIALIZATION_METHOD()

            # Assemble the CreateAccount operation
            amount = settings.STELLAR_CREATE_ACCOUNT_MINIMUM_BALANCE
            memo = TextMemo('Nucleo Created Account')
            op = CreateAccount({
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
                    'operations': [
                        op,
                    ],
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

            # If successful, increment the user's account quota val by one
            profile.accounts_created += 1
            profile.save()
        else:
            # Verify Stellar public key with the added Data Entry

            # Get the Stellar account for given public key
            # NOTE: Need to decouple Address initialization from get() method to work!
            address = Address(address=public_key, network=settings.STELLAR_NETWORK)
            address.get()

            # Obtain the signed_user data entry
            signed_user = address.data.get(settings.STELLAR_DATA_VERIFICATION_KEY, None)

            if not signed_user:
                raise ValidationError(_('Invalid data entry. Decoded Stellar Data Entry does not exist.'), code='invalid_data_entry')

            # Now decode and verify data
            self.loaded_user_id = signing.loads(base64.b64decode(signed_user))
            if self.request_user.id != self.loaded_user_id:
                raise ValidationError(_('Invalid user id. Decoded Stellar Data Entry does not match your user id.'), code='invalid_user')

            # TODO: SEND EMAIL IF KEY HAS BEEN COMPROMISED, SOMEHOW ALLOW UNFUNDED ACCOUNTS TO BE SEEN?

        return self.cleaned_data

    class Meta:
        model = Account
        fields = ['public_key', 'name', 'creating_stellar']


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
        self.request_user = kwargs.pop('request_user', None)
        super(FeedActivityCreateForm, self).__init__(*args, **kwargs)

    def clean(self):
        """
        Override to obtain transaction details from given tx_hash.
        """
        # Call the super
        super(FeedActivityCreateForm, self).clean()

        # Obtain form input parameter
        tx_hash = self.cleaned_data.get("tx_hash")

        # Make a call to Horizon to get tx and all ops associated with given tx hash
        horizon = settings.STELLAR_HORIZON_INITIALIZATION_METHOD()
        ops_json = horizon.transaction_operations(tx_hash=tx_hash)

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
            self.time = first_op['created_at']
            self.tx_href = first_op['_links']['transaction']['href'] if '_links' in first_op and 'transaction' in first_op['_links'] and 'href' in first_op['_links']['transaction'] else None
            if not self.request_user.accounts.filter(public_key=first_op['source_account']).exists():
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
            3. Buy/sell of asset (verb: offer)
            4. Follow user (verb: follow; not handled by this form but
                instead in UserFollowUpdateView)

        Only verb = 'issue', 'send' should trigger email(s)/notif(s).
        """
        if not self.ops:
            # TODO: This is a band-aid for times when tx_ops call gives a 404,
            # which seems to happen most often on offers (settlement time?).
            # Get rid of this once implement a transaction_operations nodejs listener?
            return None

        # Determine activity type and update kwargs for stream call
        request_user_profile = self.request_user.profile
        tx_hash = self.cleaned_data.get("tx_hash")
        kwargs = {
            'actor': self.request_user.id,
            'actor_username': self.request_user.username,
            'actor_pic_url': request_user_profile.pic_url(),
            'actor_href': request_user_profile.href(),
            'tx_hash': self.cleaned_data.get("tx_hash"),
            'tx_href': self.tx_href,
            'foreign_id': tx_hash,
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
            object_id = object.id if object else None
            object_username = object.username if object else None

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

            # TODO: send an email to user receiving funds

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

            # TODO: send a bulk email to all followers that a new token has been issued

        # Buy/sell of asset
        if len(self.ops) == 1 and self.ops[0]['type_i'] == Xdr.const.MANAGE_OFFER:
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


        return self.feed.add_activity(kwargs)
