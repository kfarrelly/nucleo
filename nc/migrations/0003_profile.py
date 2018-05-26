# -*- coding: utf-8 -*-
# Generated by Django 1.11.13 on 2018-05-18 00:43
from __future__ import unicode_literals

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import functools
import nc.models
import nc.validators


class Migration(migrations.Migration):

    dependencies = [
        ('auth', '0008_alter_user_username_max_length'),
        ('nc', '0002_address'),
    ]

    operations = [
        migrations.CreateModel(
            name='Profile',
            fields=[
                ('user', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, primary_key=True, serialize=False, to=settings.AUTH_USER_MODEL)),
                ('bio', models.CharField(blank=True, default=None, max_length=255, null=True)),
                ('pic', models.ImageField(blank=True, default=None, null=True, upload_to=functools.partial(nc.models.profile_file_directory_path, *(), **{b'field': 'pic'}), validators=[nc.validators.FileSizeValidator(limit_value=2621440), nc.validators.MimeTypeValidator(allowed_mimetypes=[b'image/x-cmu-raster', b'image/x-xbitmap', b'image/gif', b'image/x-portable-bitmap', b'image/jpeg', b'application/x-hdf', b'application/postscript', b'image/png', b'image/vnd.microsoft.icon', b'image/x-rgb', b'video/mpeg', b'image/x-ms-bmp', b'image/x-xpixmap', b'image/x-portable-graymap', b'image/x-portable-pixmap', b'image/tiff', b'application/pdf'])])),
                ('cover', models.ImageField(blank=True, default=None, null=True, upload_to=functools.partial(nc.models.profile_file_directory_path, *(), **{b'field': 'cover'}), validators=[nc.validators.FileSizeValidator(limit_value=2621440), nc.validators.MimeTypeValidator(allowed_mimetypes=[b'image/x-cmu-raster', b'image/x-xbitmap', b'image/gif', b'image/x-portable-bitmap', b'image/jpeg', b'application/x-hdf', b'application/postscript', b'image/png', b'image/vnd.microsoft.icon', b'image/x-rgb', b'video/mpeg', b'image/x-ms-bmp', b'image/x-xpixmap', b'image/x-portable-graymap', b'image/x-portable-pixmap', b'image/tiff', b'application/pdf'])])),
            ],
        ),
    ]
