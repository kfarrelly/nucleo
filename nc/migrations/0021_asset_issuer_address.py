# -*- coding: utf-8 -*-
# Generated by Django 1.11.13 on 2018-05-31 15:21
from __future__ import unicode_literals

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('nc', '0020_auto_20180530_2314'),
    ]

    operations = [
        migrations.AddField(
            model_name='asset',
            name='issuer_address',
            field=models.CharField(blank=True, default=None, max_length=56, null=True),
        ),
    ]
