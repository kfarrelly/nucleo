# -*- coding: utf-8 -*-
# Generated by Django 1.11.13 on 2018-05-22 15:47
from __future__ import unicode_literals

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('nc', '0012_auto_20180521_0106'),
    ]

    operations = [
        migrations.AlterField(
            model_name='account',
            name='name',
            field=models.CharField(blank=True, default=None, max_length=150, null=True, verbose_name='Account name'),
        ),
    ]
