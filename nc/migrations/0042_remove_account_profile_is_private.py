# -*- coding: utf-8 -*-
# Generated by Django 1.11.13 on 2018-08-07 15:56
from __future__ import unicode_literals

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('nc', '0041_account_profile_is_private'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='account',
            name='profile_is_private',
        ),
    ]