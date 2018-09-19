from django.core.management.base import BaseCommand
from django.utils import timezone

from nc.models import Asset, Portfolio
from nc.views import PerformanceCreateView


class Command(BaseCommand):

    def handle(self, *args, **options):
        """
        Management command to simulate (for testing) daily cron job task of
        storing performance related data for all profile portfolios
        in our db.
        """
        performance_view = PerformanceCreateView()

        # Keep track of the time cron job takes for performance reasons
        cron_start = timezone.now()

        # Get asset prices
        asset_prices = performance_view._assemble_asset_prices()

        # Bulk create portfolio value time series records for all accounts in db
        performance_view._record_portfolio_values(asset_prices)

        # For all profiles in db, recalculate performance stats
        performance_view._recalculate_performance_stats()

        # Update rank values of top performing users.
        performance_view._update_rank_values()

        # Print out length of time cron took
        cron_duration = timezone.now() - cron_start
        print 'Performance create cron job took {0} seconds for {1} assets and {2} portfolios'.format(
            cron_duration.total_seconds(),
            Asset.objects.count(),
            Portfolio.objects.count()
        )

        # Print out new rankings of top performers
        for p in Portfolio.objects.exclude(rank=None)\
            .prefetch_related('profile__user').order_by('rank'):
            # NOTE: performance_{} attrs in fractional vals so need to mult by 100
            # to get percentages.
            if p.performance_1d:
                print '{0}. {1} ({2}%)'.format(p.rank, p.profile.user.get_full_name(),
                    p.performance_1d * 100)
