from algoliasearch_django import update_records
from django.db import models


class AssetManager(models.Manager):
    def bulk_create(self, objs, batch_size=None):
        """
        Set asset_id field to each given Asset instance in objs since
        the pre_save signal won't be fired on bulk_create.
        """
        # Bulk create with cleaned asset instances
        for asset in objs:
            issuer = asset.issuer_address if asset.issuer_address else 'native'
            asset.asset_id = '{0}-{1}'.format(asset.code, issuer)
        created = super(AssetManager, self).bulk_create(objs, batch_size)

        # TODO: Figure out how to bulk create search index records. Until then,
        # rely on issuer editing asset page for asset pic/banner/color/verified
        # (good so in search only getting issuers Nucleo knows that have assets)

        # Return created assets
        return created
