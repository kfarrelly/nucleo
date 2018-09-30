from django.core.management.base import BaseCommand
from django.conf import settings
from django.utils import timezone

from nc.models import Asset
from nc.views import AssetTomlUpdateView


class Command(BaseCommand):

    def handle(self, *args, **options):
        """
        For each asset in our db, update details using toml files.
        """
        asset_toml_view = AssetTomlUpdateView()

        # Keep track of the time cron job takes for performance reasons
        cron_start = timezone.now()

        # For all assets in db,refresh attributes from toml
        asset_toml_view._update_assets_from_tomls()

        # Print out length of time cron took
        cron_duration = timezone.now() - cron_start
        print 'Asset toml update cron job took {0} seconds for {1} assets'.format(
            cron_duration.total_seconds(),
            Asset.objects.count()
        )
