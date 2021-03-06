# -*- coding: utf-8 -*-
# Generated by Django 1.11.15 on 2018-09-18 17:42
from __future__ import unicode_literals

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('nc', '0049_auto_20180918_1716'),
    ]

    operations = [
        migrations.CreateModel(
            name='Balance',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('xlm_value', models.FloatField(default=-1.0)),
                ('usd_value', models.FloatField(default=-1.0)),
                ('asset', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='portfolio_balances', to='nc.Asset')),
                ('portfolio', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='balances', to='nc.Portfolio')),
            ],
        ),
        migrations.AddField(
            model_name='portfolio',
            name='assets',
            field=models.ManyToManyField(related_name='portfolios_in', through='nc.Balance', to='nc.Asset'),
        ),
    ]
