# -*- coding: utf-8 -*-
# Generated by Django 1.11.13 on 2018-05-19 18:43
from __future__ import unicode_literals

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('nc', '0007_asset_domain'),
    ]

    operations = [
        migrations.AddField(
            model_name='profile',
            name='full_name',
            field=models.CharField(blank=True, default=None, max_length=180, null=True),
        ),
    ]
