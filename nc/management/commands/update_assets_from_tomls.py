from django.core.management.base import BaseCommand
from django.conf import settings

from nc.models import Asset


class Command(BaseCommand):

    def handle(self, *args, **options):
        """
        For each asset in our db, update details using toml files.
        """
        # Query the database for all Asset instances and then
        # update from toml files. Exclude XLM asset instance.
        asset_qs = Asset.objects.exclude(issuer_address=None)
        count = 0
        for a in asset_qs:
            # NOTE: this is expensive!
            try:
                a.update_from_toml()
                count += 1
            except:
                print 'Error occurred fetching {0}'.format(a.toml)

        print 'Updated {0} assets from .toml files'.format(count)
