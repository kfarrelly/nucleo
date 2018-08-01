# -*- coding: utf-8 -*-
from __future__ import unicode_literals

import datetime, requests, stream, sys

from allauth.account.adapter import get_adapter
from allauth.utils import build_absolute_uri

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.decorators import login_required
from django.contrib.auth.mixins import LoginRequiredMixin
from django.contrib.sites.shortcuts import get_current_site
from django.core import signing
from django.db.models import (
    BooleanField, Case, ExpressionWrapper, F, FloatField,
    prefetch_related_objects, Value, When,
)
from django.db.models.functions import Lower
from django.http import HttpResponse, HttpResponseNotFound, HttpResponseRedirect
from django.http.request import QueryDict
from django.shortcuts import get_object_or_404, render
from django.urls import reverse, reverse_lazy
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.utils.translation import ugettext_lazy as _
from django.views import generic
from django.views.decorators.csrf import csrf_exempt

from functools import partial

from stellar_base.address import Address
from stellar_base.asset import Asset as StellarAsset
from stellar_base.operation import Operation
from stellar_base.stellarxdr import Xdr

from stream_django.feed_manager import feed_manager

from urlparse import urlparse

from . import forms, mixins
from .models import (
    Account, Asset, Portfolio, portfolio_data_collector, Profile, RawPortfolioData,
)


# Web app views
## User
class UserDetailView(mixins.PrefetchedSingleObjectMixin, mixins.IndexContextMixin,
    mixins.LoginRedirectContextMixin, mixins.ActivityFormContextMixin,
    mixins.ViewTypeContextMixin, mixins.UserAssetsContextMixin, generic.DetailView):
    model = get_user_model()
    slug_field = 'username'
    template_name = 'nc/profile.html'
    prefetch_related_lookups = ['accounts', 'profile__portfolio']
    user_field = 'object'
    view_type = 'profile'

    def get_context_data(self, **kwargs):
        """
        Provide a cryptographically signed username of authenticated user
        for add Stellar account if detail object is current user.
        """
        context = super(UserDetailView, self).get_context_data(**kwargs)
        if self.object:
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


class UserRedirectView(LoginRequiredMixin, generic.RedirectView):
    query_string = True
    pattern_name = 'nc:user-detail'

    def get_redirect_url(self, *args, **kwargs):
        kwargs.update({ 'slug': self.request.user.username })
        return super(UserRedirectView, self).get_redirect_url(*args, **kwargs)


class UserUpdateView(LoginRequiredMixin, mixins.IndexContextMixin,
    mixins.ViewTypeContextMixin, generic.UpdateView):
    model = get_user_model()
    slug_field = 'username'
    form_class = forms.UserProfileUpdateMultiForm
    template_name = 'nc/profile_update_form.html'
    success_url = reverse_lazy('nc:user-redirect')
    prefetch_related_lookups = ['profile']
    view_type = 'profile'

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
    mixins.IndexContextMixin, mixins.ViewTypeContextMixin, generic.UpdateView):
    model = get_user_model()
    slug_field = 'username'
    form_class = forms.UserFollowUpdateForm
    template_name = 'nc/profile_follow_update_form.html'
    prefetch_related_lookups = ['profile']
    view_type = 'profile'

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

            # Add/remove from followers list and notify stream API of follow/unfollow
            if is_following:
                self.object.profile.followers.remove(request.user)
                feed_manager.unfollow_user(request.user.id, self.object.id)
            else:
                self.object.profile.followers.add(request.user)
                feed_manager.follow_user(request.user.id, self.object.id)

                # Add new activity to feed of user following
                # NOTE: Not using stream-django model mixin because don't want Follow model
                # instances in the Nucleo db. Adapted from feed_manager.add_activity_to_feed()
                feed = feed_manager.get_feed(settings.STREAM_USER_FEED, request.user.id)
                request_user_profile = request.user.profile
                feed.add_activity({
                    'actor': request.user.id,
                    'verb': 'follow',
                    'object': self.object.id,
                    'actor_username': request.user.username,
                    'actor_pic_url': request_user_profile.pic_url(),
                    'actor_href': request_user_profile.href(),
                    'object_username': self.object.username,
                    'object_pic_url': self.object.profile.pic_url(),
                    'object_href': self.object.profile.href(),
                })

                # Send an email to user being followed
                profile_path = reverse('nc:user-detail', kwargs={'slug': request.user.username})
                profile_url = build_absolute_uri(request, profile_path)
                ctx_email = {
                    'current_site': get_current_site(request),
                    'username': request.user.username,
                    'profile_url': profile_url,
                }
                get_adapter(request).send_mail('nc/email/feed_activity_follow',
                    self.object.email, ctx_email)

        return HttpResponseRedirect(self.get_success_url())


class UserFollowerListView(LoginRequiredMixin, mixins.IndexContextMixin,
    mixins.ViewTypeContextMixin, generic.ListView):
    template_name = 'nc/profile_follow_list.html'
    paginate_by = 50
    view_type = 'profile'

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

class UserFollowingListView(LoginRequiredMixin, mixins.IndexContextMixin,
    mixins.ViewTypeContextMixin, generic.ListView):
    template_name = 'nc/profile_follow_list.html'
    paginate_by = 50
    view_type = 'profile'

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
    mixins.IndexContextMixin, mixins.ViewTypeContextMixin, generic.CreateView):
    model = Account
    form_class = forms.AccountCreateForm
    success_url = reverse_lazy('nc:user-redirect')
    view_type = 'profile'

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

class AccountUpdateView(LoginRequiredMixin, mixins.IndexContextMixin,
    mixins.ViewTypeContextMixin, generic.UpdateView):
    model = Account
    slug_field = 'public_key'
    form_class = forms.AccountUpdateForm
    template_name = 'nc/account_update_form.html'
    success_url = reverse_lazy('nc:user-redirect')
    view_type = 'profile'

    def get_queryset(self):
        """
        Authenticated user can only update their verified accounts.
        """
        return self.request.user.accounts.all()

class AccountDeleteView(LoginRequiredMixin, mixins.IndexContextMixin,
    mixins.ViewTypeContextMixin, generic.DeleteView):
    model = Account
    slug_field = 'public_key'
    success_url = reverse_lazy('nc:user-redirect')
    view_type = 'profile'

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
class AssetRedirectView(LoginRequiredMixin, generic.RedirectView):
    query_string = True
    pattern_name = 'nc:asset-top-list'

class AssetDetailView(mixins.PrefetchedSingleObjectMixin, mixins.IndexContextMixin,
    mixins.ActivityFormContextMixin, mixins.LoginRedirectContextMixin,
    mixins.ViewTypeContextMixin, generic.DetailView):
    model = Asset
    slug_field = 'asset_id'
    template_name = 'nc/asset.html'
    prefetch_related_lookups = ['issuer__user']
    view_type = 'asset'

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
    mixins.IndexContextMixin, mixins.ViewTypeContextMixin, generic.UpdateView):
    model = Asset
    form_class = forms.AssetUpdateForm
    slug_field = 'asset_id'
    template_name = 'nc/asset_update_form.html'
    prefetch_related_lookups = ['issuer__user']
    view_type = 'asset'

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


class AssetTrustListView(LoginRequiredMixin, mixins.IndexContextMixin,
    mixins.ViewTypeContextMixin, generic.ListView):
    template_name = 'nc/asset_trust_list.html'
    paginate_by = 50
    view_type = 'asset'

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
            if k == self.object.issuer_address:
                # Then this account is the asset issuer so implicitly trusts
                already_trusts = True
                can_change_trust = False
            else:
                # Otherwise check balances for account to see if asset is there
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


class AssetTopListView(LoginRequiredMixin, mixins.IndexContextMixin,
    mixins.ViewTypeContextMixin, mixins.UserAssetsContextMixin, generic.ListView):
    template_name = "nc/asset_top_list.html"
    paginate_by = 50
    user_field = 'request.user'
    view_type = 'asset'

    def get_context_data(self, **kwargs):
        """
        Add the assets plus page related data.
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


## Leaderboard
class LeaderboardRedirectView(generic.RedirectView):
    query_string = True
    pattern_name = 'nc:leaderboard-list'

class LeaderboardListView(LoginRequiredMixin, mixins.IndexContextMixin,
    mixins.ViewTypeContextMixin, generic.ListView):
    template_name = "nc/leaderboard_list.html"
    paginate_by = 50
    view_type = 'leaderboard'

    def get_context_data(self, **kwargs):
        """
        Add the users plus page related data.
        """
        context = super(LeaderboardListView, self).get_context_data(**kwargs)

        # Include user profile with related portfolio prefetched
        profile = self.request.user.profile
        prefetch_related_objects([profile], *['portfolio'])
        context['profile'] = profile

        # Add last portfolio USD value and creation date of raw data
        portfolio_latest_rawdata = profile.portfolio.rawdata.first()
        context['portfolio_latest_usd_value'] = portfolio_latest_rawdata.usd_value\
            if portfolio_latest_rawdata and portfolio_latest_rawdata.usd_value != RawPortfolioData.NOT_AVAILABLE\
            else 0.0
        context['portfolio_latest_created'] = portfolio_latest_rawdata.created if portfolio_latest_rawdata else None

        # Add date span and associated performance attribute to use to the context
        context['date_span'] = self.date_span
        context['allowed_date_orderings'] = self.allowed_date_orderings
        context['performance_attr'] = 'performance_{0}'.format(self.date_span)

        # Set rank of asset on top of current page
        page_obj = context['page_obj']
        context['page_top_number'] = page_obj.paginator.per_page * (page_obj.number - 1) + 1

        return context

    def get_queryset(self):
        """
        Queryset is users sorted by performance rank given date span from query param.

        Default date span is 24h.
        """
        # Ordering in query param to give flexibility of performance_1w, performance_1m, etc.
        # Only return top 100 users
        self.allowed_date_orderings = [ '1d', '1w', '1m', '3m', '6m', '1y' ]
        self.date_span = self.request.GET.get('span')
        if self.date_span not in self.allowed_date_orderings:
            self.date_span = self.allowed_date_orderings[0] # default to 1d
        order = 'profile__portfolio__performance_{0}'.format(self.date_span)

        return get_user_model().objects.prefetch_related('profile__portfolio')\
            .order_by(F(order).desc(nulls_last=True))[:100]


## Feed
class FeedRedirectView(LoginRequiredMixin, generic.RedirectView):
    query_string = True
    pattern_name = 'nc:feed-activity'

### News
class FeedNewsListView(LoginRequiredMixin, mixins.IndexContextMixin,
    mixins.ViewTypeContextMixin, mixins.JSONResponseMixin, generic.ListView):
    template_name = "nc/feed_news_list.html"
    view_type = 'feed'

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
            # Include user profile with related portfolio prefetched
            profile = self.request.user.profile
            prefetch_related_objects([profile], *['portfolio'])
            context['profile'] = profile

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
        ret = []
        next_page = None
        if r.status_code == requests.codes.ok:
            json = r.json()
            next = json.get('next', None)
            next_page = QueryDict(urlparse(next).query).get('page', None) if next else None
            ret = json['results']

        # Store the next page numbers
        self.next_page = next_page

        # Return the results
        return ret

### Activity
class FeedActivityListView(LoginRequiredMixin, mixins.IndexContextMixin,
    mixins.ViewTypeContextMixin, generic.TemplateView):
    template_name = "nc/feed_activity_list.html"
    view_type = 'feed'

    def get_context_data(self, **kwargs):
        """
        Add prefetched user object for profile.
        """
        context = super(FeedActivityListView, self).get_context_data(**kwargs)

        # Include user profile with related portfolio prefetched
        profile = self.request.user.profile
        prefetch_related_objects([profile], *['portfolio'])
        context['profile'] = profile

        # Include non-sensitive stream api key and a current user timeline feed token
        feed = feed_manager.get_feed(settings.STREAM_TIMELINE_FEED, self.request.user.id)
        context['stream_api_key'] = settings.STREAM_API_KEY
        context['stream_timeline_feed'] = settings.STREAM_TIMELINE_FEED
        context['stream_feed_token'] = feed.get_readonly_token()

        return context

class FeedActivityCreateView(LoginRequiredMixin, mixins.IndexContextMixin,
    mixins.ViewTypeContextMixin, generic.CreateView):
    form_class = forms.FeedActivityCreateForm
    template_name = "nc/feed_activity_form.html"
    view_type = 'feed'

    def get_form_kwargs(self):
        """
        Need to override to pass in the request for authenticated user.

        Pop instance key since FeedActivityCreateForm is not actually a ModelForm,
        as we don't want to store Activity data in our db.
        """
        kwargs = super(FeedActivityCreateView, self).get_form_kwargs()
        kwargs.update({
            'request': self.request,
        })
        kwargs.pop('instance')
        return kwargs

    def get_success_url(self):
        """
        If success url passed into query param, then use for redirect.

        Otherwise, simply redirect to assets section of actor user's
        profile page for immediate feedback.
        """
        if self.success_url:
            return self.success_url
        return reverse('nc:user-detail', kwargs={'slug': self.request.user.username})


## Send
class SendRedirectView(LoginRequiredMixin, generic.RedirectView):
    query_string = True
    pattern_name = 'nc:send-detail'

class SendDetailView(LoginRequiredMixin, mixins.IndexContextMixin,
    mixins.ViewTypeContextMixin, mixins.ActivityFormContextMixin, generic.TemplateView):
    template_name = "nc/send.html"
    view_type = 'send'


# TODO: For way later down the line in the roadmap.
# Refactor this so it's in a separate 'api' Django app
# API Viewsets


# Worker environment views
## Cron job tasks (AWS worker tier)
@method_decorator(csrf_exempt, name='dispatch')
class PerformanceCreateView(generic.View):
    """
    Creates records of portfolio performance for each user every day. Portfolio
    consists of all accounts associated with user profile.

    AWS EB worker tier cron job POSTs to url endpoint associated with
    this view.
    """
    def _assemble_asset_prices(self):
        """
        Assemble a dictionary { asset_id: xlm_price } of current
        market prices in xlm of all assets in our db.
        """
        asset_prices = {}
        for model_asset in Asset.objects.all():
            # NOTE: Expensive! but no other way to implement as far as I see.
            asset = StellarAsset(model_asset.code, model_asset.issuer_address)
            xlm = StellarAsset.native()
            if asset.is_native():
                # Then a is native so retrieve current price in USD
                # from StellarTerm
                r = requests.get(settings.STELLARTERM_TICKER_URL)
                json = r.json()
                usd_price = float(json['_meta']['externalPrices']['USD_XLM'])
                asset_prices[model_asset.asset_id] = usd_price
            else:
                # Get the orderbook. Portfolio value is market price user
                # can sell asset at for XLM.
                # Retrieve asset record from Horizon
                horizon = settings.STELLAR_HORIZON_INITIALIZATION_METHOD()
                params = {
                    'selling_asset_type': asset.type,
                    'selling_asset_code': asset.code,
                    'selling_asset_issuer': asset.issuer,
                    'buying_asset_type': 'native',
                    'buying_asset_code': xlm.code
                }
                json = horizon.order_book(params=params)

                # Use the first bid price if there is one
                price = 0.0
                if 'bids' in json and len(json['bids']) > 0:
                    price = float(json['bids'][0]['price'])
                asset_prices[model_asset.asset_id] = price
        return asset_prices

    def _record_portfolio_values(self, asset_prices):
        """
        Use the given asset_prices dictionary to record current
        portfolio values for all accounts in our db.
        """
        Portfolio.objects.update_timeseries('rawdata',
            partial(portfolio_data_collector, asset_prices=asset_prices))

    def _recalculate_performance_stats(self):
        """
        Recalculate performance stats for all profile portfolios in our db.
        """
        # TODO: Expensive! Figure out how to implement this with aggregates so not looping over queries
        for portfolio in Portfolio.objects.all():
            # Run queries where filter on created > now - timedelta(1d, 1w, etc.) and
            # not equal to the default of unavailable
            # take the last() off that qset. Use USD val.
            # 1d, 1w, 1m, 3m, 6m, 1y
            now = timezone.now()

            # NOTE: qset.last() gives None if qset is empty. otherwise, last entry. Using
            # last because TimeSeriesModel has ordering '-created'.
            # NOTE: Including extra 0.5d in filter bc cron job timing isn't exact
            portfolio_latest_rawdata = portfolio.rawdata.first()
            attr_oldest = {
                'performance_1d': portfolio.rawdata.filter(created__gte=now-datetime.timedelta(days=1.5))\
                    .exclude(usd_value=RawPortfolioData.NOT_AVAILABLE).last(),
                'performance_1w': portfolio.rawdata.filter(created__gte=now-datetime.timedelta(days=7.5))\
                    .exclude(usd_value=RawPortfolioData.NOT_AVAILABLE).last(),
                'performance_1m': portfolio.rawdata.filter(created__gte=now-datetime.timedelta(days=30.5))\
                    .exclude(usd_value=RawPortfolioData.NOT_AVAILABLE).last(),
                'performance_3m': portfolio.rawdata.filter(created__gte=now-datetime.timedelta(days=90.5))\
                    .exclude(usd_value=RawPortfolioData.NOT_AVAILABLE).last(),
                'performance_6m': portfolio.rawdata.filter(created__gte=now-datetime.timedelta(days=180.5))\
                    .exclude(usd_value=RawPortfolioData.NOT_AVAILABLE).last(),
                'performance_1y': portfolio.rawdata.filter(created__gte=now-datetime.timedelta(days=365.5))\
                    .exclude(usd_value=RawPortfolioData.NOT_AVAILABLE).last(),
            }

            for attr, oldest_data in attr_oldest.iteritems():
                if oldest_data and oldest_data.usd_value != RawPortfolioData.NOT_AVAILABLE\
                    and portfolio_latest_rawdata.usd_value != RawPortfolioData.NOT_AVAILABLE:
                    performance = (portfolio_latest_rawdata.usd_value - oldest_data.usd_value) / oldest_data.usd_value
                else:
                    performance = None
                setattr(portfolio, attr, performance)

            portfolio.save()

    def _update_rank_values(self):
        """
        Update rank values of top 100 users by performance over last year.
        Reset all existing rank values first in update to None.
        """
        # Reset all existing first so can easily just start from scratch in
        # storing rank list.
        Portfolio.objects.exclude(rank=None).update(rank=None)

        # Iterate through top 100 on yearly performance, and store the rank.
        # TODO: Expensive! Incorporate django_bulk_update and create custom util.TimeSeries classes
        for i, p in enumerate(list(Portfolio.objects\
            .exclude(performance_1d=None).order_by('-performance_1d')[:100])):
            p.rank = i + 1
            p.save()

    def post(self, request, *args, **kwargs):
        # If worker environment, then can process cron job
        if settings.ENV_NAME == 'work':
            # Get asset prices
            asset_prices = self._assemble_asset_prices()

            # Bulk create portfolio value time series records for all accounts in db
            self._record_portfolio_values(asset_prices)

            # For all profiles in db, recalculate performance stats
            self._recalculate_performance_stats()

            # Update rank values of top performing users.
            self._update_rank_values()

            return HttpResponse()
        else:
            return HttpResponseNotFound()
