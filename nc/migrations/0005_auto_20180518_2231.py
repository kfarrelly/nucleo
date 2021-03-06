# -*- coding: utf-8 -*-
# Generated by Django 1.11.13 on 2018-05-18 22:31
from __future__ import unicode_literals

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import functools
import nc.models
import nc.validators


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('nc', '0004_auto_20180518_0045'),
    ]

    operations = [
        migrations.CreateModel(
            name='Account',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('public_key', models.CharField(max_length=56, unique=True)),
                ('name', models.CharField(blank=True, default=None, max_length=150, null=True)),
                ('pic', models.ImageField(blank=True, default=None, null=True, upload_to=functools.partial(nc.models.profile_file_directory_path, *(), **{b'field': 'pic'}), validators=[nc.validators.FileSizeValidator(limit_value=2621440), nc.validators.MimeTypeValidator(allowed_mimetypes=[b'image/x-cmu-raster', b'image/x-xbitmap', b'image/gif', b'image/x-portable-bitmap', b'image/jpeg', b'application/x-hdf', b'application/postscript', b'image/png', b'image/vnd.microsoft.icon', b'image/x-rgb', b'video/mpeg', b'image/x-ms-bmp', b'image/x-xpixmap', b'image/x-portable-graymap', b'image/x-portable-pixmap', b'image/tiff', b'application/pdf'])])),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='accounts', to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.RemoveField(
            model_name='address',
            name='user',
        ),
        migrations.DeleteModel(
            name='Address',
        ),
    ]
