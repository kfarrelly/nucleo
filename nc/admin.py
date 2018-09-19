# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.contrib import admin

from . import models

# Register your models here.
admin.site.register(models.Profile)
admin.site.register(models.Account)
admin.site.register(models.Asset)
admin.site.register(models.Portfolio)
admin.site.register(models.RawPortfolioData)
admin.site.register(models.Balance)
