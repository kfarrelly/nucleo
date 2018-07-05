from django.conf import settings
from django.db.models.signals import (
    m2m_changed, pre_save, post_save,
)
from django.dispatch import receiver

from .models import Asset, Profile


# Profile
@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def update_model_user_details(sender, instance, created, **kwargs):
    """
    Keep profile.full_name, account.user_full_name, account.user_pic_url
    in sync with user instance.

    Need to use .save() versus update since index.ProfileIndex, index.AccountIndex
    are synced to the post_save signal of Profile, Account models.
    """
    # Ignore created instance because it won't have a profile
    if instance.id and not created:
        # Change profile full name attr
        profile = instance.profile
        profile.full_name = instance.get_full_name()
        profile.save()

        # Iterate through all the accounts user has as well
        # NOTE: this is expensive if have many many accounts so another incentive to cap account #
        for account in instance.accounts.all():
            account.user_full_name = instance.get_full_name()
            account.user_pic_url = profile.pic.url if profile.pic else None
            account.save()


@receiver(m2m_changed, sender=Profile.followers.through)
def update_profile_followers_count(sender, instance, **kwargs):
    """
    Keep profile.followers_count in sync with profile.followers.count().

    Need to use profile.save() versus update since index.ProfileIndex
    is synced to the post_save signal of Profile model.
    """
    instance.followers_count = instance.followers.count()
    instance.save()


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
