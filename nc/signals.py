from django.conf import settings
from django.db.models.signals import (
    post_save, m2m_changed
)
from django.dispatch import receiver

from .models import Profile


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
