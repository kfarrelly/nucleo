# -*- coding: utf-8 -*-
from __future__ import unicode_literals

import os

from django.conf import settings
from django.db import models
from django.urls import reverse
from django.utils.crypto import get_random_string
from django.utils.encoding import python_2_unicode_compatible
from django.utils.translation import ugettext_lazy as _

from functools import partial

from . import validators


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

# TODO: need management command to create Profile for admininstrator account
@python_2_unicode_compatible
class Profile(models.Model):
    """
    Profile associated with a user.
    """
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
    accounts_created = models.PositiveSmallIntegerField(default=0)

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
        return self.pic.url if self.pic else None

    def href(self):
        """
        Have this method as a proxy for the search index.
        """
        return reverse('nc:user-detail', kwargs={'slug': self.user.username})

    def __str__(self):
        bio =  ': ' + self.bio if self.bio else ''
        return self.user.username + bio


@python_2_unicode_compatible
class Account(models.Model):
    """
    Store of Stellar public key addresses associated with user.
    """
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
        return self.pic.url if self.pic else None

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
    # NOTE: if None then must be Lumens: https://www.stellar.org/developers/guides/concepts/assets.html
    issuer = models.ForeignKey(Account, related_name='assets_issued',
        on_delete=models.CASCADE, null=True, blank=True, default=None)
    domain = models.CharField(max_length=255, null=True, blank=True, default=None)
    code = models.CharField(max_length=12)
    asset_id = models.CharField(max_length=70, null=True, blank=True, default=None)
    color = models.CharField(max_length=6, null=True, blank=True, default=None)
    pic = models.ImageField(
        _('Asset photo'),
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
    verified = models.BooleanField(default=False)

    def issuer_public_key(self):
        """
        Have this method as a proxy for the search index.
        """
        return self.issuer.public_key if self.issuer else None

    def issuer_handle(self):
        """
        Have this method as a proxy for the search index.
        """
        return '@' + self.issuer.user.username if self.issuer else 'Stellar Network'

    def pic_url(self):
        """
        Have this method as a proxy for the search index.
        """
        return self.pic.url if self.pic else None

    def href(self):
        """
        Have this method as a proxy for the search index.
        """
        return reverse('nc:asset-detail', kwargs={'slug': self.asset_id})

    class Meta:
        unique_together = ('issuer', 'code')

    def __str__(self):
        return self.asset_id
