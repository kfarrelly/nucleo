# -*- coding: utf-8 -*-
from __future__ import unicode_literals

import algoliasearch_django as algoliasearch

from django.apps import AppConfig

from . import index


class NcConfig(AppConfig):
    name = 'nc'

    def ready(self):
        # Import the signals
        from . import signals

        # Register the search indexes
        algoliasearch.register(self.get_model('Profile'), index.ProfileIndex)
        algoliasearch.register(self.get_model('Account'), index.AccountIndex)
        algoliasearch.register(self.get_model('Asset'), index.AssetIndex)
