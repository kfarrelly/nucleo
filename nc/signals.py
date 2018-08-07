import urlparse

from algoliasearch_django import update_records

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db.models.signals import (
    m2m_changed, pre_save, post_save,
)
from django.dispatch import receiver

from .models import Account, Asset, Profile


# Profile
@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def update_model_user_details(sender, instance, created, **kwargs):
    """
    Keep profile.full_name, account.user_full_name, account.user_pic_url
    in sync with user instance.

    Need to use .save() versus update since index.ProfileIndex,
    are synced to the post_save signal of Profile model.

    Use update_records to bulk update all accounts associated with user profile
    for index.AccountIndex.
    """
    # Ignore created instance because it won't have a profile
    if instance.id and not created:
        # Change profile full name attr
        profile = instance.profile
        profile.full_name = instance.get_full_name()
        profile.save()


@receiver(pre_save, sender=Profile)
def preset_model_user_details(sender, instance, **kwargs):
    """
    Keep profile.full_name, account.user_full_name, account.user_pic_url
    in sync with user instance.

    Need to use .save() versus update since index.ProfileIndex,
    are synced to the post_save signal of Profile model.

    Use update_records to bulk update all accounts associated with user profile
    for index.AccountIndex.
    """
    # Change profile full name attr
    instance.full_name = instance.user.get_full_name()


@receiver(post_save, sender=Profile)
def update_model_user_details(sender, instance, created, **kwargs):
    """
    Keep account.profile_is_private in sync with user.profile instance.

    Use update_records to bulk update all accounts associated with profile.
    """
    # Ignore created instance because it won't have accounts
    user = instance.user
    if user.id and not created:
        # Update all associated accounts
        profile_is_private = [0] if not instance.is_private else [1] # NOTE: Need this to be a list of ints in order to work with OR bool alongside viewable_by_if_private
        user_full_name = user.get_full_name()
        user_pic_url = instance.pic.url if instance.pic else None
        update_records(Account, user.accounts.all(),
            user_full_name=user_full_name, user_pic_url=user_pic_url,
            profile_is_private=profile_is_private)


@receiver(m2m_changed, sender=Profile.followers.through)
def update_profile_followers_count(sender, instance, **kwargs):
    """
    Keep profile.followers_count, profile.viewable_by_if_private in sync
    with profile.followers.count() and profile.followers.all().

    Need to use profile.save() versus update since index.ProfileIndex
    is synced to the post_save signal of Profile model.

    To update viewable_by_if_private (since proxy method), use
    update_records()
    """
    instance.followers_count = instance.followers.count()
    instance.save()

    follower_ids = [ u.id for u in instance.followers.all()\
        .union(get_user_model().objects.filter(id=instance.user.id)) ]
    update_records(Account, instance.user.accounts.all(),
        viewable_by_if_private=follower_ids)


# Asset
@receiver(pre_save, sender=Asset)
def update_asset(sender, instance, **kwargs):
    """
    Keep asset.asset_id in sync with asset.code-asset.issuer.public_key
    and asset.issuer_address in sync if asset.issuer.public_key
    """
    # Set the issuer address to be in sync first
    issuer_account_exists = (instance.issuer != None)
    if issuer_account_exists:
        instance.issuer_address = instance.issuer.public_key

    # Then set the asset_id to be in sync
    if issuer_account_exists or instance.issuer_address:
        instance.asset_id = '{0}-{1}'.format(instance.code, instance.issuer_address)
    else:
        instance.asset_id = '{0}-{1}'.format(instance.code, 'native')

    # Check that toml and toml_pic URLField entries use https
    url_attrs = [ 'toml', 'toml_pic' ]
    for attr in url_attrs:
        url_val = getattr(instance, attr, None)
        if url_val:
            # Parse url and replace protocol so always https
            new_url_val = urlparse.urlparse(url_val)._replace(scheme='https').geturl()
            setattr(instance, attr, new_url_val)
