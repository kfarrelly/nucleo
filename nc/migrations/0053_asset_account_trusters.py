# -*- coding: utf-8 -*-
# Generated by Django 1.11.15 on 2018-09-27 13:03
from __future__ import unicode_literals

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('nc', '0052_auto_20180921_1616'),
    ]

    operations = [
        migrations.AddField(
            model_name='asset',
            name='account_trusters',
            field=models.ManyToManyField(related_name='assets_trusting', to='nc.Account'),
        ),
    ]