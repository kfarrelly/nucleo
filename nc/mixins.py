import algoliasearch_django, copy

from algoliasearch_django import algolia_engine

from collections import OrderedDict

from django.conf import settings
from django.core import signing
from django.db.models import prefetch_related_objects
from django.http import JsonResponse
from django.views.generic.detail import SingleObjectMixin

from operator import attrgetter

from stellar_base.address import Address

from stream_django.feed_manager import feed_manager

from . import forms
from .models import Account, Asset, RawPortfolioData


class PrefetchedSingleObjectMixin(SingleObjectMixin):
    """
    Override to allow for prefetching of related fields.
    """
    prefetch_related_lookups = []

    def get_object(self, queryset=None):
        object = super(PrefetchedSingleObjectMixin, self).get_object(queryset)
        prefetch_related_objects([object], *self.prefetch_related_lookups)
        return object


class AjaxableResponseMixin(object):
    """
    Mixin to add AJAX support to a form.
    Must be used with an object-based FormView (e.g. CreateView)
    https://docs.djangoproject.com/en/2.0/topics/class-based-views/generic-editing/#ajax-example
    """
    def form_invalid(self, form):
        response = super(AjaxableResponseMixin, self).form_invalid(form)
        if self.request.is_ajax():
            return JsonResponse(form.errors, status=400)
        else:
            return response

    def form_valid(self, form):
        # We make sure to call the parent's form_valid() method because
        # it might do some processing (in the case of CreateView, it will
        # call form.save() for example).
        response = super(AjaxableResponseMixin, self).form_valid(form)

        # TODO: Add more to the data to be returned!
        if self.request.is_ajax():
            data = {}
            if hasattr(self.object, 'pk'):
                data['pk'] = self.object.pk

            return JsonResponse(data)
        else:
            return response


class JSONResponseMixin:
    """
    A mixin that can be used to render a JSON response.
    """
    def render_to_json_response(self, context, **response_kwargs):
        """
        Returns a JSON response, transforming 'context' to make the payload.
        """
        return JsonResponse(
            self.get_data(context),
            **response_kwargs
        )

    def get_data(self, context):
        """
        Returns an object that will be serialized as JSON by json.dumps().
        """
        # Note: This is *EXTREMELY* naive; in reality, you'll need
        # to do much more complex handling to ensure that arbitrary
        # objects -- such as Django model instances or querysets
        # -- can be serialized as JSON.
        # NOTE: This will work for our simple implementation when reporting
        # GET results from the Stellar network using python client
        return context


class IndexContextMixin(object):
    """
    A mixin that adds index search constants to the context data.
    """
    def get_context_data(self, **kwargs):
        kwargs = super(IndexContextMixin, self).get_context_data(**kwargs)
        kwargs.update({
            'index_app_id': settings.ALGOLIA.get('APPLICATION_ID', ''),
            'index_names': {
                model.__name__: algoliasearch_django.get_adapter(model).index_name
                for model in algoliasearch_django.get_registered_model()
            },
            'index_api_keys': {
                model.__name__: algoliasearch_django.get_adapter(model)\
                    .get_secured_api_key(self.request)
                for model in algoliasearch_django.get_registered_model()
            },
        })
        return kwargs


class RecaptchaContextMixin(object):
    """
    A mixin that adds the reCAPTCHA site key.
    """
    def get_context_data(self, **kwargs):
        kwargs = super(RecaptchaContextMixin, self).get_context_data(**kwargs)
        kwargs['recaptcha_site_key'] = settings.GOOGLE_RECAPTCHA_SITE_KEY
        return kwargs


class AccountFormContextMixin(object):
    """
    A mixin that adds the create Stellar account form to the context data.
    """
    user_field = ''

    def get_context_data(self, **kwargs):
        kwargs = super(AccountFormContextMixin, self).get_context_data(**kwargs)

        try:
            user = attrgetter(self.user_field)(self)
        except AttributeError:
            user = None

        # Update the context for cryptographically signed username
        # Include the account creation form as well for Nucleo to store
        # the verified public key
        kwargs['verification_key'] = settings.STELLAR_DATA_VERIFICATION_KEY
        if self.request.user.is_authenticated and self.request.user == user:
            kwargs['signed_user'] = signing.dumps(self.request.user.id)
            kwargs['account_form'] = forms.AccountCreateForm()

        return kwargs


class ActivityFormContextMixin(object):
    """
    A mixin that adds the create feed activity form to the context data.
    """
    def get_context_data(self, **kwargs):
        kwargs = super(ActivityFormContextMixin, self).get_context_data(**kwargs)
        kwargs.update({
            'activity_form': forms.FeedActivityCreateForm(),
        })
        return kwargs


class LoginRedirectContextMixin(object):
    """
    A mixin that adds a link to login page with next url as
    current request page.

    Meant for views that don't require authenticated user access.
    """
    def get_context_data(self, **kwargs):
        kwargs = super(LoginRedirectContextMixin, self).get_context_data(**kwargs)
        kwargs.update({
            'login_redirect': '%s?next=%s' % (settings.LOGIN_URL, self.request.path),
        })
        return kwargs


class ViewTypeContextMixin(object):
    """
    A mixin that adds a view type variable to the context.

    Meant to easily identify which navigation item to highlight in HTML.
    Allowed values are: "leaderboard", "asset", "send", "receive", "feed", "profile".
    """
    view_type = ''

    def get_context_data(self, **kwargs):
        kwargs = super(ViewTypeContextMixin, self).get_context_data(**kwargs)
        kwargs.update({
            'view_type': self.view_type,
        })
        return kwargs


class FeedActivityContextMixin(object):
    """
    A mixin that adds activity feed variables to the context for easy
    client-side access to stream_django.
    """
    user_field = ''
    feed_type = None

    def get_context_data(self, **kwargs):
        """
        Include non-sensitive stream api key and a current user feed token
        for specified feed type.
        """
        kwargs = super(FeedActivityContextMixin, self).get_context_data(**kwargs)

        try:
            user = attrgetter(self.user_field)(self)
        except AttributeError:
            user = None

        if user and not user.is_anonymous:
            feed = feed_manager.get_feed(self.feed_type, user.id)
            kwargs.update({
                'stream_api_key': settings.STREAM_API_KEY,
                'stream_feed_id': user.id,
                'stream_feed_type': self.feed_type,
                'stream_feed_token': feed.get_readonly_token(),
            })
        return kwargs


class DepositAssetsContextMixin(object):
    """
    A mixin that adds the deposit assets in our db associated with
    crypto anchor.
    """
    def get_context_data(self, **kwargs):
        kwargs = super(DepositAssetsContextMixin, self).get_context_data(**kwargs)
        assets = Asset.objects.filter(domain=settings.PAPAYA_DOMAIN, verified=True).order_by('code')
        kwargs.update({
            'deposit_assets': assets,
            'papaya_api_deposit_url': settings.PAPAYA_API_DEPOSIT_URL,
        })
        return kwargs


class UserAssetsContextMixin(object):
    """
    A mixin that adds in Stellar address dictionary associated with each account
    user has plus list of all assets this user owns.
    """
    # NOTE: This mixin is expensive for now given Horizon API single account only
    # endpoint. Use with caution!
    user_field = ''

    def _build_assets(self, asset_pairs, issuers):
        """
        Create model instances for any assets we don't have in Nucleo db
        after retrieve user account balances from Horizon.

        asset_pairs is an iterable of tuples of form [(code, issuer)] needed
        to build new instances.

        issuers is a dict { public_key: Account } of existing addresses in our
        db as Account instances.

        Returns {(code, issuer): Asset} dict to use in update of context model_assets

        NOTE: Technically shouldn't be creating on a GET, but ignore this
        as it might be a good way to incrementally accumulate model assets
        in the beginning.
        """
        # Clean given asset_pairs so only include tuples with code, issuer (no None vals)
        cleaned_asset_pairs = [ tup for tup in asset_pairs if tup[1] != None ]

        # Create new model assets.
        # NOTE: Include asset_id since pre_save signal won't fire on bulk_create
        new_assets = [
            Asset(code=asset_code, issuer=issuers.get(asset_issuer, None), issuer_address=asset_issuer)
            if issuers.get(asset_issuer, None) != None
            else Asset(code=asset_code, issuer_address=asset_issuer)
            for asset_issuer, asset_code in cleaned_asset_pairs
        ]
        created = Asset.objects.bulk_create(new_assets)

        return {
            (asset.issuer_address, asset.code): asset
            for asset in created
        }

    def get_context_data(self, **kwargs):
        kwargs = super(UserAssetsContextMixin, self).get_context_data(**kwargs)

        try:
            user = attrgetter(self.user_field)(self)
        except AttributeError:
            user = None

        if user and user.is_authenticated:
            # Build the accounts dict
            addresses = {
                account.public_key: Address(address=account.public_key,
                    network=settings.STELLAR_NETWORK)
                for account in user.accounts.all()
            }
            # NOTE: This is expensive! Might have to roll out into JS with loader
            # Need to decouple Address initialization from get() method to work!
            for k, a in addresses.iteritems():
                a.get()

            # Build the total assets list for this user. Keep track of
            # all the issuers to query if they have User instances with us
            # TODO: Refactor this and templates to use as key asset_id = asset_code-asset_issuer
            assets = {}
            for public_key, address in addresses.iteritems():
                for b in address.balances:
                    # NOTE: 'asset_issuer', 'asset_code' are only None for native type
                    tup = (b.get('asset_issuer', None), b.get('asset_code', None))
                    asset = assets.get(tup, None)
                    if not asset:
                        # Copy the balance to the assets dict
                        assets[tup] = copy.deepcopy(b)
                    else:
                        # Update the total balance of this asset type
                        asset['balance'] = str(float(asset['balance']) + float(b['balance'])).decode()

            # TODO?: Sort the assets by total balance in ref of USD/XLM?

            # Build list to see if any issuers of assets are in our db
            issuer_public_keys = [ k[0] for k in assets if k[0] ]
            issuers = {
                acc.public_key: acc
                for acc in Account.objects.filter(public_key__in=issuer_public_keys)\
                    .select_related('user')
            }

            # Build the model assets for pic of token in template
            # NOTE: Getting all of the assets each issuer offers here versus just those
            # the current user owns to make the Asset query easier
            model_asset_ids = [
                k[1] + '-' + k[0]
                if k[0] else 'XLM-native'
                for k, v in assets.iteritems()
            ]
            model_assets = {
                (a.issuer_address, a.code): a
                for a in Asset.objects.filter(asset_id__in=model_asset_ids)\
                    .select_related('issuer')
            }

            # Build any model assets that aren't in our db
            # General try, except here because always want to return user obj no matter what
            try:
                new_model_assets = self._build_assets(
                    asset_pairs=set(assets.keys()).difference(set(model_assets.keys())),
                    issuers=issuers,
                )
                model_assets.update(new_model_assets)
            except:
                pass

            # Update the list of assets the user associated with the profile trusts in db
            # TODO: When implement tx activity listener for Stellar accounts, listen to Change Trust
            # ops to implement the below in real time for ledger changes
            user.assets_trusting.clear()
            user.assets_trusting.add(*Asset.objects.filter(asset_id__in=model_asset_ids))

            # Update the kwargs
            kwargs.update({
                'addresses': addresses,
                'num_addresses': len(addresses.keys()),
                'assets': assets,
                'issuers': issuers,
                'model_assets': model_assets,
            })

        return kwargs


class UserFollowerRequestsContextMixin(object):
    """
    A mixin that adds current user's follower requests prefetched.
    """
    def get_context_data(self, **kwargs):
        kwargs = super(UserFollowerRequestsContextMixin, self).get_context_data(**kwargs)

        # Include user profile with related follower requests prefetched
        if self.request.user.is_authenticated:
            # Include follower requests with related requester.profile prefetched
            follower_requests = self.request.user.follower_requests\
                .prefetch_related('requester__profile')
            kwargs['follower_requests'] = follower_requests

        return kwargs


class UserPortfolioContextMixin(object):
    """
    A mixin that adds current user's portfolio related data.

    Default to performance_attr of 1d for portfolio performance to display.
    """
    performance_attr = 'performance_1d'

    def get_context_data(self, **kwargs):
        kwargs = super(UserPortfolioContextMixin, self).get_context_data(**kwargs)

        # Always include the performance attribute
        kwargs['performance_attr'] = self.performance_attr

        # Include user profile with related portfolio prefetched
        if self.request.user.is_authenticated:
            profile = self.request.user.profile
            prefetch_related_objects([profile], *['portfolio'])
            kwargs['profile'] = profile

            # Add last portfolio USD value and creation date of raw data
            portfolio_latest_rawdata = profile.portfolio.rawdata.first()
            kwargs['portfolio_latest_usd_value'] = portfolio_latest_rawdata.usd_value\
                if portfolio_latest_rawdata and portfolio_latest_rawdata.usd_value != RawPortfolioData.NOT_AVAILABLE\
                else 0.0
            kwargs['portfolio_latest_created'] = portfolio_latest_rawdata.created if portfolio_latest_rawdata else None

        return kwargs
