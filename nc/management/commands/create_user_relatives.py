from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from nc.models import Portfolio, Profile


class Command(BaseCommand):

    def handle(self, *args, **options):
        """
        Management command to ensure each user object has
        an associated profile and portfolio instance.
        """
        # NOTE: Expensive but necessary. Not using bulk_create to ensure that
        # search indices are also updated
        created_profile = 0
        for u in get_user_model().objects.filter(profile=None):
            p = Profile.objects.create(user=u)
            if p:
                created_profile += 1

        created_portfolio = 0
        for p in Profile.objects.filter(portfolio=None):
            port = Portfolio.objects.create(profile=p)
            if port:
                created_portfolio += 1

        print 'Created {0} profiles and {1} portfolios'.format(created_profile, created_portfolio)
