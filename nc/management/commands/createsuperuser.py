from django.core.management.base import BaseCommand

from django.contrib.auth import get_user_model

from django.utils import timezone

class Command(BaseCommand):

    def handle(self, *args, **options):
        User = get_user_model()
        admin_email = 'admin@nucleo.fi'
        if not User.objects.filter(email=admin_email).exists():
            User.objects.create_superuser(username="admin", email=admin_email, password="tobereplaced")
