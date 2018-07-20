from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.utils import timezone

from nc.models import Profile


class Command(BaseCommand):

    def handle(self, *args, **options):
        User = get_user_model()
        admin_email = 'help@nucleo.fi'

        # Create the user account if necessary
        try:
            user = User.objects.get(username="nucleo")
        except User.DoesNotExist:
            user = User.objects.create_superuser(username="admin", email=admin_email, password="tobereplaced")


        # Create the associated profile if needed
        profile, profile_created = Profile.objects.get_or_create(user=user)
