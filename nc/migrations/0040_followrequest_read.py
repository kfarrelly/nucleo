# -*- coding: utf-8 -*-
# Generated by Django 1.11.13 on 2018-08-05 22:53
from __future__ import unicode_literals

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('nc', '0039_auto_20180805_1854'),
    ]

    operations = [
        migrations.AddField(
            model_name='followrequest',
            name='read',
            field=models.DateTimeField(blank=True, default=None, null=True),
        ),
    ]
