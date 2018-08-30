# -*- coding: utf-8 -*-
from __future__ import unicode_literals

import os, requests, toml, urlparse

from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.staticfiles.templatetags.staticfiles import static
from django.db import models
from django.urls import reverse
from django.utils.crypto import get_random_string
from django.utils.encoding import python_2_unicode_compatible
from django.utils.translation import ugettext_lazy as _

from functools import partial

from stellar_base.asset import Asset as StellarAsset
from stellar_base.address import Address

from timeseries.utils import TimeSeriesModel, TimeSeriesManager

from . import managers, validators


def profile_file_directory_path(instance, filename, field):
    """
    File will be uploaded to MEDIA_ROOT/profile/<user_id>/<field>/<filename>
    """
    file_root, file_ext = os.path.splitext(filename)
    new_file_root = get_random_string().upper()
    new_filename = new_file_root + file_ext
    return 'profile/{0}/{1}/{2}'.format(instance.user_id, field, new_filename)

def model_file_directory_path(instance, filename, field):
    """
    File will be uploaded to MEDIA_ROOT/<model>/<id>/<field>/<filename>
    """
    file_root, file_ext = os.path.splitext(filename)
    new_file_root = get_random_string().upper()
    new_filename = new_file_root + file_ext
    return '{0}/{1}/{2}/{3}'.format(type(instance).__name__.lower(),
        instance.id, field, new_filename)

@python_2_unicode_compatible
class Profile(models.Model):
    """
    Profile associated with a user.
    """
    DEFAULT_PIC_URL = static('nc/images/profile.png')

    user = models.OneToOneField(settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE, related_name='profile', primary_key=True)
    bio = models.CharField(max_length=255, null=True, blank=True, default=None)
    pic = models.ImageField(
        _('Profile picture'),
        validators=[validators.validate_file_size, validators.validate_image_mimetype],
        upload_to=partial(profile_file_directory_path, field='pic'),
        null=True, blank=True, default=None
    )
    cover = models.ImageField(
        _('Cover photo'),
        validators=[validators.validate_file_size, validators.validate_image_mimetype],
        upload_to=partial(profile_file_directory_path, field='cover'),
        null=True, blank=True, default=None
    )
    followers = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        related_name='profiles_following'
    )
    # NOTE: If private profile, must approve follower request for other user to
    # see assets, accounts, etc.
    is_private = models.BooleanField(default=False)
    accounts_created = models.PositiveSmallIntegerField(default=0)

    # Settings
    ## Email
    allow_payment_email = models.BooleanField(default=True)
    allow_token_issuance_email = models.BooleanField(default=True)
    allow_trade_email = models.BooleanField(default=True)
    allow_follower_email = models.BooleanField(default=True)

    # NOTE: user.get_full_name(), followers.count() are duplicated here
    # so Algolia search index updates work when user, follower updates occur (kept in sync through signals.py)
    full_name = models.CharField(max_length=200, null=True, blank=True, default=None)
    followers_count = models.IntegerField(default=0)

    def username(self):
        """
        Have this method as a proxy for the search index.

        user.username will never change in the db so search index related
        update issues with related fields don't exist here.
        """
        return self.user.username

    def pic_url(self):
        """
        Have this method as a proxy for the search index.
        """
        pic_url = self.DEFAULT_PIC_URL
        if self.pic:
            pic_url = self.pic.url
        return pic_url

    def href(self):
        """
        Have this method as a proxy for the search index.
        """
        return reverse('nc:user-detail', kwargs={'slug': self.user.username})

    def __str__(self):
        bio =  ': ' + self.bio if self.bio else ''
        return self.user.username + bio


@python_2_unicode_compatible
class FollowRequest(models.Model):
    """
    Email settings associated with a user.
    """
    user = models.ForeignKey(settings.AUTH_USER_MODEL,
        related_name='follower_requests', on_delete=models.CASCADE)
    requester = models.ForeignKey(settings.AUTH_USER_MODEL,
        related_name='requests_to_follow', on_delete=models.CASCADE)
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'requester')

    def __str__(self):
        return 'Follow request: ' + self.requester.username + ' -> ' + self.user.username


@python_2_unicode_compatible
class Account(models.Model):
    """
    Store of Stellar public key addresses associated with user.
    """
    DEFAULT_PIC_URL = static('nc/images/account.png')

    public_key = models.CharField(max_length=56, unique=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL,
        related_name='accounts', on_delete=models.CASCADE)
    name = models.CharField(_('Account name'), max_length=150,
        null=True, blank=True, default=None)
    pic = models.ImageField(
        _('Account photo'),
        validators=[validators.validate_file_size, validators.validate_image_mimetype],
        upload_to=partial(model_file_directory_path, field='pic'),
        null=True, blank=True, default=None
    )

    # NOTE: user.get_full_name(), user.pic, profile_is_private duplicated here
    # so Algolia search index updates work when user updates occur (kept in sync through signals.py)
    user_full_name = models.CharField(max_length=200, null=True, blank=True, default=None)
    user_pic_url = models.URLField(null=True, blank=True, default=None)

    def username(self):
        """
        Have this method as a proxy for the search index.

        user.username will never change in the db so search index related
        update issues with related fields don't exist here.
        """
        return self.user.username

    def profile_is_private(self):
        """
        Have this method as a proxy for the search index.

        Returns [0] if profile.is_private and [1] if not private.

        Need this to be a list of ints in order to work with OR bool
        in index.AccountIndex filters alongside viewable_by_if_private.
        """
        is_private_int = 0 if not self.user.profile.is_private else 1
        return [ is_private_int ]

    def viewable_by_if_private(self):
        """
        Have this method as a proxy for the search index to determine who
        can view this account if associated profile is private.

        If private, account can only be seen by those who follow this user's
        profile and the user themselves.

        Will have to call AccountIndex.save_record() if associated profile
        follower status changes. TODO: Use user change signals.
        """
        return [ u.id for u in self.user.profile.followers.all()\
            .union(get_user_model().objects.filter(id=self.user.id)) ]

    def pic_url(self):
        """
        Have this method as a proxy for the search index.
        """
        pic_url = self.DEFAULT_PIC_URL
        if self.pic:
            pic_url = self.pic.url
        return pic_url

    def href(self):
        """
        Have this method as a proxy for the search index.
        """
        return '{}#accounts'.format(reverse('nc:user-detail', kwargs={'slug': self.user.username}))

    def __str__(self):
        name = self.name + ': ' if self.name else ''
        return name + self.public_key


@python_2_unicode_compatible
class Asset(models.Model):
    """
    Store of Stellar public asset information so can customize image icon
    plus color scheme.

    If issuer is registered in Nucleo, allow them to change the color, pic
    of asset.
    """
    DEFAULT_PIC_URL = static('nc/images/asset.png')

    # NOTE: If None, then either doesn't have an account with us OR must be Lumens
    issuer = models.ForeignKey(Account, related_name='assets_issued',
        on_delete=models.CASCADE, null=True, blank=True, default=None)

    # NOTE: if None then must be Lumens: https://www.stellar.org/developers/guides/concepts/assets.html
    issuer_address = models.CharField(max_length=56, null=True, blank=True, default=None)
    domain = models.CharField(max_length=255, null=True, blank=True, default=None)
    code = models.CharField(max_length=12)
    asset_id = models.CharField(max_length=70, null=True, blank=True, default=None)

    # NOTE: Since these meta fields are defined in the TOML (which Nucleo can't change
    # directly for logged in user clientside), should store them here to be safe
    name = models.CharField(max_length=255, null=True, blank=True, default=None)
    description = models.CharField(max_length=255, null=True, blank=True, default=None)
    conditions = models.CharField(max_length=255, null=True, blank=True, default=None)
    display_decimals = models.PositiveSmallIntegerField(default=7)

    pic = models.ImageField(
        _('Asset profile photo'),
        validators=[validators.validate_file_size, validators.validate_image_mimetype],
        upload_to=partial(model_file_directory_path, field='pic'),
        null=True, blank=True, default=None
    )
    cover = models.ImageField(
        _('Asset cover photo'),
        validators=[validators.validate_file_size, validators.validate_image_mimetype],
        upload_to=partial(model_file_directory_path, field='cover'),
        null=True, blank=True, default=None
    )
    whitepaper = models.FileField(
        validators=[validators.validate_pdf_file_extension, validators.validate_file_size,
            validators.validate_pdf_mimetype],
        upload_to=partial(model_file_directory_path, field='whitepaper'),
        null=True, blank=True, default=None
    )

    toml = models.URLField(null=True, blank=True, default=None)
    toml_pic = models.URLField(null=True, blank=True, default=None)
    verified = models.BooleanField(default=False)

    # Asset manager
    objects = managers.AssetManager()

    def issuer_handle(self):
        """
        Have this method as a proxy for the search index.
        """
        if self.issuer:
            issuer_handle = '@' + self.issuer.user.username
        elif self.issuer_address:
            issuer_handle = None
        else:
            issuer_handle = 'Stellar Network'
        return issuer_handle

    def pic_url(self):
        """
        Have this method as a proxy for the search index.
        """
        pic_url = self.DEFAULT_PIC_URL
        if self.pic:
            pic_url = self.pic.url
        elif self.toml_pic:
            pic_url = self.toml_pic
        return pic_url

    def href(self):
        """
        Have this method as a proxy for the search index.
        """
        return reverse('nc:asset-detail', kwargs={'slug': self.asset_id})

    def type(self):
        """
        Have this method as a proxy for stellar asset type so don't have to
        rewrite guess() from stellar_base.
        """
        stellar_asset = StellarAsset(self.code, self.issuer_address)
        return stellar_asset.type

    def update_from_toml(self, toml_url=None):
        """
        Fetch toml file and update attributes of this instance with its details.
        """
        changed = False

        # Set the new toml value if given one
        if toml_url != self.toml:
            self.toml = toml_url
            self.domain = urlparse.urlparse(toml_url).netloc if toml_url else None
            if not toml_url:
                self.verified = False
            changed = True

        # Fetch the toml file and check for this asset in [[CURRENCIES]]
        # Use try except in case no toml file exists at given toml_url
        if self.toml:
            try:
                r = requests.get(self.toml)
                parsed_toml = toml.loads(r.text)
                matched_currencies = [ c for c in parsed_toml.get('CURRENCIES', [])
                    if c.get('code', None) == self.code and c.get('issuer') == self.issuer_address ]
                self.verified = (len(matched_currencies) == 1)
                if self.verified:
                    # If matched, then asset has been verified and start updating instance fields
                    currency = matched_currencies[0]
                    if 'image' in currency:
                        changed = (changed or currency['image'] != self.toml_pic)
                        self.toml_pic = currency['image']

                    if 'name' in currency:
                        # NOTE: problems here if desc is longer than 255 so concat for db
                        changed = (changed or currency['name'][:255] != self.name)
                        self.name = currency['name'][:255]

                    if 'desc' in currency:
                        # NOTE: problems here if desc is longer than 255 so concat for db
                        changed = (changed or currency['desc'][:255] != self.description)
                        self.description = currency['desc'][:255]

                    if 'conditions' in currency:
                        # NOTE: problems here if conditions is longer than 255 so concat for db
                        changed = (changed or currency['conditions'][:255] != self.conditions)
                        self.conditions = currency['conditions'][:255]

                    if 'display_decimals' in currency:
                        changed = (changed or currency['display_decimals'] != self.display_decimals)
                        self.display_decimals = currency['display_decimals']
            except requests.exceptions.ConnectionError:
                changed = (changed or self.verified != False)
                self.verified = False

        # Save the instance
        if changed:
            self.save()

    class Meta:
        unique_together = ('issuer_address', 'code')

    def __str__(self):
        if self.asset_id:
            asset_id = self.asset_id
        elif self.issuer_address:
            asset_id = '{0}-{1}'.format(self.code, self.issuer_address)
        else:
            asset_id = '{0}-{1}'.format(instance.code, 'native')
        return asset_id


@python_2_unicode_compatible
class Portfolio(models.Model):
    """
    Stores time series data tracking cumulative value (in XLM) user has
    in all accounts associated with their user profile.
    """
    profile = models.OneToOneField(Profile,
        on_delete=models.CASCADE, related_name='portfolio', primary_key=True)

    # Performance stats for: 1d, 1w, 1m, 3m, 6m, 1y.
    # NOTE: Fractional values (i.e. need to mult by 100 to get percentages)
    performance_1d = models.FloatField(null=True, blank=True, default=None)
    performance_1w = models.FloatField(null=True, blank=True, default=None)
    performance_1m = models.FloatField(null=True, blank=True, default=None)
    performance_3m = models.FloatField(null=True, blank=True, default=None)
    performance_6m = models.FloatField(null=True, blank=True, default=None)
    performance_1y = models.FloatField(null=True, blank=True, default=None)

    # Rank is ordering of users for 1d performance. Only rank top 100
    rank = models.PositiveIntegerField(null=True, blank=True, default=None)

    # Portfolio manager
    objects = TimeSeriesManager()

    def __str__(self):
        return 'Portfolio: ' + self.profile.user.username


@python_2_unicode_compatible
class RawPortfolioData(TimeSeriesModel):
    TIMESERIES_INTERVAL = timedelta(hours=0.5)  # update daily on cron job but put min interval at 1/2 hour to be safe
    NOT_AVAILABLE = -1.0

    portfolio = models.ForeignKey(Portfolio, related_name='rawdata')
    xlm_value = models.FloatField(default=NOT_AVAILABLE)
    usd_value = models.FloatField(default=NOT_AVAILABLE)

    def __str__(self):
        return str(self.portfolio) + ': ' + str(self.usd_value) + ' (' + str(self.created) + ')'


def portfolio_data_collector(queryset, asset_prices):
    """
    Should return an iterable that yields dictionaries of data
    needed to successfully create a RawPortfolioData instance.

    asset_prices is a dict with asset_id: current_market_price, with
    market prices as float.
    If not native, market prices in XLM. Otherwise, in USD.
    """
    # Store the xlm price in USD from asset_prices dict
    usd_xlm_price = asset_prices['XLM-native']

    # Accumulate stellar addresses for each user
    portfolio_addresses = [
        {
            'portfolio': pt,
            'addresses': [
                Address(address=a.public_key, network=settings.STELLAR_NETWORK)
                for a in pt.profile.user.accounts.all()
            ]
        }
        for pt in queryset.prefetch_related('profile__user__accounts')
    ]

    # Retrieve addresses from Horizon then calculate portfolio value
    # given asset balances
    ret = []
    for obj in portfolio_addresses:
        pt = obj['portfolio']
        pt_addrs = obj['addresses']
        # Only record portfolio value if user has registered at least one account
        if pt_addrs:
            # Get xlm_val added for each asset held in each account
            xlm_val = 0.0
            for a in pt_addrs:
                a.get()
                for b in a.balances:
                    if b['asset_type'] == 'native':
                        xlm_val += float(b['balance'])
                    else:
                        asset_id = '{0}-{1}'.format(b['asset_code'], b['asset_issuer'])
                        price = asset_prices.get(asset_id, 0.0)
                        xlm_val += float(b['balance']) * price

            # Append to return iterable a dict of the data
            ret.append({ 'portfolio': pt, 'xlm_value': xlm_val, 'usd_value': xlm_val * usd_xlm_price })

    return ret
