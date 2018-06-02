import requests

from django.core.management.base import BaseCommand
from django.conf import settings

from nc.models import Account, Asset


class Command(BaseCommand):

    def handle(self, *args, **options):
        """
        Management command to fetch assets from known Stellar registeries
        (StellarTerm for now) to initially populate our asset db.
        """
        # Accumulate asset_ids that are already in our db
        existing_asset_ids = [
            a.asset_id for a in Asset.objects.exclude(asset_id=None)
        ]

        # Fetch the StellarTerm assets json
        r = requests.get(settings.STELLARTERM_TICKER_URL)
        fetched_assets = r.json().get('assets', [])

        # Sort through fetched assets and only keep those not in our db
        # and ignore those without an issuer
        cleaned_fetched_assets = [
            a for a in fetched_assets
            if a['id'] not in existing_asset_ids and a['issuer'] != None
        ]

        # Also retrieve any corresponding issuer accounts from our db
        cleaned_issuer_addresses = [ a['issuer'] for a in cleaned_fetched_assets ]
        relevant_accounts = {
            account.public_key: account
            for account in Account.objects.filter(public_key__in=cleaned_issuer_addresses)
        }

        # Sort through fetched assets and only create new ones for those not in our db
        new_assets = [
            Asset(
                issuer=relevant_accounts.get(a['issuer'], None),
                issuer_address=a['issuer'], domain=a['domain'], code=a['code'],
                asset_id=a['id'],
                toml="https://{0}{1}".format(a['domain'], settings.STELLAR_TOML_PATH),
            )
            for a in cleaned_fetched_assets
        ]
        created = Asset.objects.bulk_create(new_assets)
        print 'Created {0} new assets in the db'.format(len(created))
