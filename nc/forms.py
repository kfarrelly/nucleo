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
from stellar_base.memo import TextMemo
from stellar_base.operation import CreateAccount
from stellar_base.transaction import Transaction
from stellar_base.transaction_envelope import TransactionEnvelope as Te

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

        # TODO: GET THE TRANSACTION FROM HORIZON. ISSUES WITH NUMBER OF OPERATIONS IN THERE?
        # TODO: GET OPS ASSOCIATED WITH TRANSACTION HASH!
        print tx_hash

        return self.cleaned_data

    def save(self):
        # TODO: IMPLEMENT SUCH THAT ADD TO REQUEST.USER FEED ON STREAM
        # TAKE THE RETRIEVED TX STORED BY self.clean() and parse ops to create
        # the needed activities on stream feed.
