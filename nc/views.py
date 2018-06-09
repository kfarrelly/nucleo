# -*- coding: utf-8 -*-
from __future__ import unicode_literals

import copy, requests, sys

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.decorators import login_required
from django.contrib.auth.mixins import LoginRequiredMixin
from django.core import signing
from django.db.models import (
    BooleanField, Case, ExpressionWrapper, F, FloatField,
    prefetch_related_objects, Value, When,
)
from django.db.models.functions import Lower
from django.http import HttpResponseRedirect
from django.http.request import QueryDict
from django.shortcuts import get_object_or_404, render
from django.urls import reverse, reverse_lazy
from django.utils.translation import ugettext_lazy as _
from django.views import generic

from stellar_base.address import Address
from stellar_base.operation import Operation
from stellar_base.stellarxdr import Xdr

from urlparse import urlparse

from . import forms, mixins
from .models import (
    Account, Asset, Profile,
)


# Web app views
## User
class UserDetailView(mixins.PrefetchedSingleObjectMixin, mixins.IndexContextMixin,
    mixins.LoginRedirectContextMixin, generic.DetailView):
    model = get_user_model()
    slug_field = 'username'
    template_name = 'nc/profile.html'
    prefetch_related_lookups = ['accounts', 'profile']

    def get_context_data(self, **kwargs):
        """
        Add in Stellar address dictionary associated with each account plus
        list of all assets this user owns.

        Provide a cryptographically signed username of authenticated user
        for add Stellar account if detail object is current user.
        """
        context = super(UserDetailView, self).get_context_data(**kwargs)
        if self.object:
            # Build the accounts dict
            addresses = {
                account.public_key: Address(address=account.public_key,
                    network=settings.STELLAR_NETWORK)
                for account in self.object.accounts.all()
            }
            # NOTE: This is expensive! Might have to roll out into JS with loader
            # Need to decouple Address initialization from get() method to work!
            for k, a in addresses.iteritems():
                a.get()

            # Build the total assets list for this user. Keep track of
            # all the issuers to query if they have User instances with us
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
            model_assets = {
                (a.issuer_address, a.code): a
                for a in Asset.objects\
                    .filter(issuer_address__in=issuer_public_keys)\
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

            # Update the context
            context['addresses'] = addresses
            context['num_addresses'] = len(addresses.keys())
            context['assets'] = assets
            context['issuers'] = issuers
            context['model_assets'] = model_assets

            # Update the context for follow attrs
            context['followers_count'] = self.object.profile.followers.count()
            context['following_count'] = self.object.profiles_following.count()
            context['is_following'] = self.object.profile.followers\
                .filter(id=self.request.user.id).exists() if self.request.user else False

            # Update the context for cryptographically signed username
            # Include the account creation form as well for Nucleo to store
            # the verified public key
            context['verification_key'] = settings.STELLAR_DATA_VERIFICATION_KEY
            if self.request.user and self.request.user == self.object:
                context['signed_user'] = signing.dumps(self.request.user.id)
                context['account_form'] = forms.AccountCreateForm()
        return context

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


class UserDetailRedirectView(LoginRequiredMixin, generic.RedirectView):
    query_string = True
    pattern_name = 'nc:user-detail'

    def get_redirect_url(self, *args, **kwargs):
        kwargs.update({ 'slug': self.request.user.username })
        return super(UserDetailRedirectView, self).get_redirect_url(*args, **kwargs)


class UserUpdateView(LoginRequiredMixin, mixins.IndexContextMixin, generic.UpdateView):
    model = get_user_model()
    slug_field = 'username'
    form_class = forms.UserProfileUpdateMultiForm
    template_name = 'nc/profile_update_form.html'
    success_url = reverse_lazy('nc:user-redirect')
    prefetch_related_lookups = ['profile']

    def get_form_kwargs(self):
        """
        Need to override to pass in appropriate instances to multiform.

        https://django-betterforms.readthedocs.io/en/latest/multiform.html#working-with-updateview
        """
        kwargs = super(UserUpdateView, self).get_form_kwargs()
        kwargs.update(instance={
            'user': self.object,
            'profile': self.object.profile,
        })
        return kwargs

    def get_queryset(self):
        """
        Authenticated user can only update themselves.
        """
        return self.model.objects.filter(id=self.request.user.id)


class UserFollowUpdateView(LoginRequiredMixin, mixins.PrefetchedSingleObjectMixin,
    mixins.IndexContextMixin, generic.UpdateView):
    model = get_user_model()
    slug_field = 'username'
    form_class = forms.UserFollowUpdateForm
    template_name = 'nc/profile_follow_update_form.html'
    prefetch_related_lookups = ['profile']

    def get_context_data(self, **kwargs):
        context = super(UserFollowUpdateView, self).get_context_data(**kwargs)
        if self.object:
            context['is_following'] = self.object.profile.followers\
                .filter(id=self.request.user.id).exists()
        return context

    def get_success_url(self):
        """
        If success url passed into query param, then use for redirect.
        Otherwise, simply redirect to followed user's profile page.
        """
        if self.success_url:
            return self.success_url

        return reverse('nc:user-detail', kwargs={'slug': self.object.username})

    def post(self, request, *args, **kwargs):
        """
        Toggle whether authenticated user is following detail user.
        """
        self.object = self.get_object()
        self.success_url = request.POST.get('success_url', None)

        if self.object and self.object != self.request.user:
            is_following = self.object.profile.followers\
                .filter(id=request.user.id).exists()
            if is_following:
                self.object.profile.followers.remove(request.user)
            else:
                self.object.profile.followers.add(request.user)

        return HttpResponseRedirect(self.get_success_url())


class UserFollowerListView(LoginRequiredMixin, mixins.IndexContextMixin, generic.ListView):
    template_name = 'nc/profile_follow_list.html'
    paginate_by = 50

    def get_context_data(self, **kwargs):
        """
        Add a boolean for template to determine if listing followers
        or following.
        """
        context = super(UserFollowerListView, self).get_context_data(**kwargs)
        context['in_followers'] = True
        context['object'] = self.object
        return context

    def get_queryset(self):
        self.object = get_object_or_404(get_user_model(), username=self.kwargs['slug'])
        is_following_ids = [
            u.id for u in get_user_model().objects\
                .filter(profile__in=self.request.user.profiles_following.all())
        ]
        return self.object.profile.followers\
            .annotate(is_following=Case(
                When(id__in=is_following_ids, then=Value(True)),
                default=Value(False),
                output_field=BooleanField(),
            ))\
            .order_by(Lower('first_name'))\
            .prefetch_related('profile')

class UserFollowingListView(LoginRequiredMixin, mixins.IndexContextMixin, generic.ListView):
    template_name = 'nc/profile_follow_list.html'
    paginate_by = 50

    def get_context_data(self, **kwargs):
        """
        Add a boolean for template to determine if listing followers
        or following.
        """
        context = super(UserFollowingListView, self).get_context_data(**kwargs)
        context['in_followers'] = False
        context['object'] = self.object
        return context

    def get_queryset(self):
        self.object = get_object_or_404(get_user_model(), username=self.kwargs['slug'])
        is_following_ids = [
            u.id for u in get_user_model().objects\
                .filter(profile__in=self.request.user.profiles_following.all())
        ]
        return get_user_model().objects\
            .filter(profile__in=self.object.profiles_following.all())\
            .annotate(is_following=Case(
                When(id__in=is_following_ids, then=Value(True)),
                default=Value(False),
                output_field=BooleanField(),
            ))\
            .order_by(Lower('first_name'))\
            .prefetch_related('profile')


## Account
class AccountCreateView(LoginRequiredMixin, mixins.AjaxableResponseMixin,
    mixins.IndexContextMixin, generic.CreateView):
    model = Account
    form_class = forms.AccountCreateForm
    success_url = reverse_lazy('nc:user-redirect')

    def get_form_kwargs(self):
        """
        Need to override to pass in the request for authenticated user.
        """
        kwargs = super(AccountCreateView, self).get_form_kwargs()
        kwargs.update({
            'request_user': self.request.user
        })
        return kwargs

    def form_valid(self, form):
        """
        Override to set request.user as Account.user before
        committing the form.save()
        """
        self.object = form.save(commit=False)
        self.object.user = self.request.user
        self.object.save()
        return HttpResponseRedirect(self.get_success_url())

class AccountUpdateView(LoginRequiredMixin, mixins.IndexContextMixin, generic.UpdateView):
    model = Account
    slug_field = 'public_key'
    form_class = forms.AccountUpdateForm
    template_name = 'nc/account_update_form.html'
    success_url = reverse_lazy('nc:user-redirect')

    def get_queryset(self):
        """
        Authenticated user can only update their verified accounts.
        """
        return self.request.user.accounts.all()

class AccountDeleteView(LoginRequiredMixin, mixins.IndexContextMixin, generic.DeleteView):
    model = Account
    slug_field = 'public_key'
    success_url = reverse_lazy('nc:user-redirect')

    def get_queryset(self):
        """
        Authenticated user can only update their verified accounts.
        """
        return self.request.user.accounts.all()

class AccountOperationListView(mixins.JSONResponseMixin, generic.TemplateView):
    template_name = 'nc/account_operation_list.html'

    def render_to_response(self, context):
        """
        Returns only JSON. Not meant for actual HTML page viewing.
        In future, transition this to DRF API endpoint.
        """
        return self.render_to_json_response(context)

    def get_context_data(self, **kwargs):
        """
        Pass through for Stellar operations data given account slug. Adds a
        list of relevant Nucleo users for public_keys involved in returned
        operations.
        """
        object = get_object_or_404(Account, public_key=self.kwargs['slug'])
        context = {}
        context['object'] = {
            'name': object.name,
            'public_key': object.public_key,
        }

        # Query Horizon to obtain pass through JSON response
        # TODO: In future, use DRF to serialize/deserialize Stellar objects properly
        address = Address(address=object.public_key,
            network=settings.STELLAR_NETWORK)

        # If any query params given by client, append the to the params dict
        # for ops GET call to Horizon
        params = self.request.GET.dict()
        json = address.operations(**params)

        # Store the next cursor if it exists
        prev_cursor = params.get('cursor', None)
        cursor = None
        if '_links' in json and 'next' in json['_links'] and 'href' in json['_links']['next']:
            cursor = QueryDict(urlparse(json['_links']['next']['href']).query).get('cursor', None)

        context['cursor'] = cursor
        context['has_more'] = cursor and prev_cursor != cursor

        # Store the records from Horizon in context
        records = json
        if '_embedded' in json and 'records' in json['_embedded']:
            records = json['_embedded']['records']
        context['records'] = records

        # Sort through list of returned operations to accumulate dict
        # of { public_key: user } for user identity mapping in template.
        context['accounts'] = self._parse_for_accounts(records)
        return context

    def _parse_operation_for_accounts(self, record):
        """
        Returns a list of relevant account public keys for given
        operation record.
        """
        if record['type_i'] == Xdr.const.CREATE_ACCOUNT:
            return [ record['account'], record['funder'] ]
        elif record['type_i'] == Xdr.const.PAYMENT:
            return [ record['from'], record['to'] ]
        elif record['type_i'] == Xdr.const.PATH_PAYMENT:
            return [ record['from'], record['to'] ]
        elif record['type_i'] == Xdr.const.CHANGE_TRUST:
            return [ record['trustee'], record['trustor'] ]
        elif record['type_i'] == Xdr.const.ALLOW_TRUST:
            return [ record['trustee'], record['trustor'] ]
        elif record['type_i'] == Xdr.const.SET_OPTIONS:
            return []
        elif record['type_i'] == Xdr.const.MANAGE_OFFER:
            return []
        elif record['type_i'] == Xdr.const.CREATE_PASSIVE_OFFER:
            return []
        elif record['type_i'] == Xdr.const.ACCOUNT_MERGE:
            return [ record['into'] ]
        elif record['type_i'] == Xdr.const.INFLATION:
            return []
        elif record['type_i'] == Xdr.const.MANAGE_DATA:
            return []

    def _parse_for_accounts(self, records):
        """
        Build the list of relevant public keys to search for in Nucleo db.

        Returns dict of format { public_key: user }
        """
        # Parse through records, building list of relevant public keys
        # for each record
        public_key_list_of_lists = [
            self._parse_operation_for_accounts(record)
            for record in records
        ]

        # Flatten the list of lists and force uniqueness with a set
        public_key_list = [
            item for sublist in public_key_list_of_lists for item in sublist
        ]
        public_keys = list(set(public_key_list))

        # Now query the db for relevant accounts and form
        # appropriate dict with format ...
        # { public_key: { 'username': user.username, 'href': link_to_user_profile } }
        accounts = {
            a.public_key: {
                'username': a.user.username,
                'href': reverse('nc:user-detail', kwargs={'slug': a.user.username})
            }
            for a in Account.objects.filter(public_key__in=public_keys)\
                .select_related('user')
        }
        return accounts


## Asset
class AssetDetailView(mixins.PrefetchedSingleObjectMixin, mixins.IndexContextMixin,
    mixins.LoginRedirectContextMixin, generic.DetailView):
    model = Asset
    slug_field = 'asset_id'
    template_name = 'nc/asset.html'
    prefetch_related_lookups = ['issuer__user']

    def get_context_data(self, **kwargs):
        """
        Override to include asset from Horizon API GET.
        """
        # Use horizon object.assets() with params:
        # https://github.com/StellarCN/py-stellar-base/blob/v0.2/stellar_base/horizon.py
        context = super(AssetDetailView, self).get_context_data(**kwargs)

        is_native = (self.object.issuer_address == None)
        context.update({'is_native': is_native})

        record = None
        if not is_native:
            # Include the issuer URL on Horizon
            context['asset_issuer_stellar_href'] = settings.STELLAR_HORIZON + '/accounts/' + self.object.issuer_address

            # Retrieve asset record from Horizon
            horizon = settings.STELLAR_HORIZON_INITIALIZATION_METHOD()
            params = {
                'asset_issuer': self.object.issuer_address,
                'asset_code': self.object.code,
            }
            json = horizon.assets(params=params)

            # Store the asset record from Horizon in context
            # NOTE: On testnet, won't get a record if mainnet issuer id isn't the same as testnet's
            record = None
            if '_embedded' in json and 'records' in json['_embedded'] and json['_embedded']['records']:
                record = json['_embedded']['records'][0]

            # Update existing model asset in our db
            # General try, except here because always want to return asset
            # obj no matter what
            try:
                self.object = self._update_asset(record)
                context.update({'object': self.object})
            except:
                pass

        context['asset'] = record

        return context

    def _update_asset(self, record):
        """
        Update model asset instance given fetched asset record from Horizon call.

        Returns updated model_asset.

        NOTE: Technically shouldn't be creating on a GET, but ignore this
        as it might be a good way to incrementally accumulate model assets
        in the beginning.
        """
        model_asset = self.object

        # Use toml attribute of record to update instance from toml file (to fetch)
        if record and '_links' in record and 'toml' in record['_links'] and 'href' in record['_links']['toml']:
            toml_url = record['_links']['toml']['href']
            if toml_url:
                model_asset.update_from_toml(toml_url)

        return model_asset


class AssetUpdateView(LoginRequiredMixin, mixins.PrefetchedSingleObjectMixin,
    mixins.IndexContextMixin, generic.UpdateView):
    model = Asset
    form_class = forms.AssetUpdateForm
    slug_field = 'asset_id'
    template_name = 'nc/asset_update_form.html'
    prefetch_related_lookups = ['issuer__user']

    def get_queryset(self):
        """
        Authenticated user can only update assets they have issued.
        """
        return self.model.objects.filter(issuer__user=self.request.user)

    def get_success_url(self):
        """
        If success url passed into query param, then use for redirect.
        Otherwise, simply redirect to asset profile page.
        """
        if self.success_url:
            return self.success_url

        return reverse('nc:asset-detail', kwargs={'slug': self.object.asset_id})


class AssetTrustListView(LoginRequiredMixin, mixins.IndexContextMixin, generic.ListView):
    template_name = 'nc/asset_trust_list.html'
    paginate_by = 50

    def get_context_data(self, **kwargs):
        """
        Add a boolean for template to determine if listing followers
        or following.
        """
        context = super(AssetTrustListView, self).get_context_data(**kwargs)

        # Add the asset to the context
        context['object'] = self.object
        context['is_native'] = (self.object.issuer_address == None)

        # Build the addresses dict
        addresses = {
            account.public_key: Address(address=account.public_key,
                network=settings.STELLAR_NETWORK)
            for account in self.object_list
        }
        # NOTE: This is expensive! Might have to roll out into JS with loader
        # Need to decouple Address initialization from get() method to work!
        for k, a in addresses.iteritems():
            a.get()

        # Build the trust dict with appropriate booleans: { public_key: {already_trusts: bool, can_change_trust: bool} }
        # NOTE: for now, ignore minimum balance issues
        trust = {}
        for k, a in addresses.iteritems():
            already_trusts = False
            can_change_trust = True
            for b in a.balances:
                is_the_asset = (b.get('asset_issuer', None) == self.object.issuer_address\
                    and b.get('asset_code', None) == self.object.code)
                if is_the_asset:
                    already_trusts = True
                    if float(b['balance']) > 0.0:
                        # Can't remove trust if have a balance of this asset
                        can_change_trust = False
            trust[k] = {'already_trusts': already_trusts, 'can_change_trust': can_change_trust}

        context['addresses'] = addresses
        context['trust'] = trust
        return context

    def get_queryset(self):
        """
        Queryset is this user's accounts but store the Asset instance as well.
        """
        self.object = get_object_or_404(Asset, asset_id=self.kwargs['slug'])
        return self.request.user.accounts.all()


class AssetTopListView(mixins.IndexContextMixin, mixins.LoginRedirectContextMixin,
    generic.ListView):
    template_name = "nc/asset_top_list.html"
    paginate_by = 50

    def get_context_data(self, **kwargs):
        """
        Add a boolean for template to determine if listing followers
        or following.
        """
        context = super(AssetTopListView, self).get_context_data(**kwargs)

        # Set ticker assets and rank of asset on top of current page
        context['ticker_assets'] = self.ticker_assets
        page_obj = context['page_obj']
        context['page_top_number'] = page_obj.paginator.per_page * (page_obj.number - 1) + 1

        return context

    def get_queryset(self):
        """
        Queryset is assets with asset_id in StellarTerm ticker list.
        """
        # Fetch the StellarTerm ticker json and store
        r = requests.get(settings.STELLARTERM_TICKER_URL)
        json = r.json()
        ticker_assets = json.get('assets', [])

        # Clean the asset list
        cleaned_ticker_assets = [ a for a in ticker_assets
            if 'activityScore' in a and a['activityScore'] > 0 ]

        # Parse to get asset_ids for queryset filter
        top_asset_ids = [ a['id'] for a in cleaned_ticker_assets ]

        # Store the dict version of ticker assets
        self.ticker_assets = {
            a['id']: a
            for a in cleaned_ticker_assets
        }

        # Order the qset by activityScore
        # TODO: Figure out how to annotate qset properly
        assets = list(Asset.objects.filter(asset_id__in=top_asset_ids))
        for a in assets:
            a.score = self.ticker_assets[a.asset_id]['activityScore']
        assets.sort(key=lambda a: a.score, reverse=True)

        return assets


class TradeRedirectView(LoginRequiredMixin, generic.RedirectView):
    query_string = True
    pattern_name = 'nc:trade-exchange'


class TradeExchangeView(mixins.IndexContextMixin, mixins.LoginRedirectContextMixin,
    generic.TemplateView):
    template_name = "nc/trade_exchange.html"


class FeedRedirectView(LoginRequiredMixin, generic.RedirectView):
    query_string = True
    pattern_name = 'nc:feed-news'


class FeedNewsListView(LoginRequiredMixin, mixins.IndexContextMixin,
    mixins.JSONResponseMixin, generic.ListView):
    template_name = "nc/feed_news.html"

    def render_to_response(self, context):
        """
        Look for a 'format=json' GET argument to determine if response
        should be HTML or JSON.
        """
        # Look for a 'format=json' GET argument
        if self.request.GET.get('format') == 'json':
            return self.render_to_json_response(context)
        else:
            return super(FeedNewsListView, self).render_to_response(context)

    def get_context_data(self, **kwargs):
        """
        Add previous, next urls and prefetched user object for profile.
        """
        context = super(FeedNewsListView, self).get_context_data(**kwargs)
        if self.request.GET.get('format') == 'json':
            # Look for a 'format=json' GET argument and only store the object
            # list as 'results' if JSON response expected
            context = { 'results': context['object_list'] }
        else:
            # Include user profile
            context['profile'] = self.request.user.profile

        # Set the next link urls
        context['next'] = '{0}?page={1}&format=json'.format(self.request.path, self.next_page) if self.next_page else None

        return context

    def get_queryset(self):
        """
        Queryset is paginated news list from CryptoPanic.
        """
        params = self.request.GET.copy()
        # Fetch the news items from CryptoPanic
        base_url = settings.CRYPTOPANIC_STELLAR_POST_URL
        kwargs = {
            'auth_token': settings.CRYPTOPANIC_API_KEY,
            'currencies': 'XLM',
            'public': True
        }
        if 'page' in params:
            kwargs.update({ 'page': params.get('page', '') })

        params.update(kwargs)
        full_url = '{0}?{1}'.format(base_url, params.urlencode())

        r = requests.get(full_url)
        json = r.json()

        # Store the next page numbers
        next = json.get('next', None)
        self.next_page = QueryDict(urlparse(next).query).get('page', None) if next else None

        # Return the results
        return json['results']


class FeedActivityListView(LoginRequiredMixin, mixins.IndexContextMixin,
    generic.TemplateView):
    template_name = "nc/feed_activity.html"


# TODO: For way later down the line in the roadmap.
# Refactor this so it's in a separate 'api' Django app
# API Viewsets
