# -*- coding: utf-8 -*-
# Generated by Django 1.11.15 on 2018-10-08 14:00
from __future__ import unicode_literals

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('nc', '0053_asset_account_trusters'),
    ]

    operations = [
        migrations.CreateModel(
            name='FundAccountRequest',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('public_key', models.CharField(max_length=56, unique=True)),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('requester', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='requests_to_fund_account', to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.AlterUniqueTogether(
            name='fundaccountrequest',
            unique_together=set([('public_key', 'requester')]),
        ),
    ]