# -*- coding: utf-8 -*-
# Generated by Django 1.11.13 on 2018-05-20 04:15
from __future__ import unicode_literals

from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('nc', '0009_remove_profile_full_name'),
    ]

    operations = [
        migrations.AddField(
            model_name='profile',
            name='followers',
            field=models.ManyToManyField(related_name='profiles_following', to=settings.AUTH_USER_MODEL),
        ),
    ]
