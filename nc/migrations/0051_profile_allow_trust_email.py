# -*- coding: utf-8 -*-
# Generated by Django 1.11.15 on 2018-09-20 08:29
from __future__ import unicode_literals

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('nc', '0050_auto_20180918_1742'),
    ]

    operations = [
        migrations.AddField(
            model_name='profile',
            name='allow_trust_email',
            field=models.BooleanField(default=True),
        ),
    ]
