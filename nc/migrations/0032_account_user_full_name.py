# -*- coding: utf-8 -*-
# Generated by Django 1.11.13 on 2018-06-15 23:20
from __future__ import unicode_literals

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('nc', '0031_auto_20180606_0300'),
    ]

    operations = [
        migrations.AddField(
            model_name='account',
            name='user_full_name',
            field=models.CharField(blank=True, default=None, max_length=200, null=True),
        ),
    ]
