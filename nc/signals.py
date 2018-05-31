from django.conf import settings
from django.db.models.signals import (
    m2m_changed, pre_save, post_save,
)
from django.dispatch import receiver

from .models import Asset, Profile


# Profile
@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def update_profile_full_name(sender, instance, **kwargs):
    """
    Keep profile.full_name in sync with user.get_full_name().

    Need to use profile.save() versus update since index.ProfileIndex
    is synced to the post_save signal of Profile model.
    """
    if instance.id:
        profile = instance.profile
        profile.full_name = instance.get_full_name()
        profile.save()


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
def update_asset_id(sender, instance, **kwargs):
    """
    Keep asset.asset_id in sync with asset.code-asset.issuer.public_key.
    """
    issuer = instance.issuer.public_key if instance.issuer else 'native'
    instance.asset_id = instance.code + '-' + issuer
