# -*- coding: utf-8 -*-
# Generated by Django 1.11.13 on 2018-05-30 21:31
from __future__ import unicode_literals

from django.db import migrations, models
import functools
import nc.models
import nc.validators


class Migration(migrations.Migration):

    dependencies = [
        ('nc', '0017_asset_verified'),
    ]

    operations = [
        migrations.AddField(
            model_name='asset',
            name='cover',
            field=models.ImageField(blank=True, default=None, null=True, upload_to=functools.partial(nc.models.model_file_directory_path, *(), **{b'field': 'cover'}), validators=[nc.validators.FileSizeValidator(limit_value=2621440), nc.validators.MimeTypeValidator(allowed_mimetypes=[b'image/x-cmu-raster', b'image/x-xbitmap', b'image/gif', b'image/x-portable-bitmap', b'image/jpeg', b'application/x-hdf', b'application/postscript', b'image/png', b'image/vnd.microsoft.icon', b'image/x-rgb', b'video/mpeg', b'image/x-ms-bmp', b'image/x-xpixmap', b'image/x-portable-graymap', b'image/x-portable-pixmap', b'image/tiff', b'application/pdf'])], verbose_name='Asset cover photo'),
        ),
        migrations.AlterField(
            model_name='account',
            name='pic',
            field=models.ImageField(blank=True, default=None, null=True, upload_to=functools.partial(nc.models.model_file_directory_path, *(), **{b'field': 'pic'}), validators=[nc.validators.FileSizeValidator(limit_value=2621440), nc.validators.MimeTypeValidator(allowed_mimetypes=[b'image/x-cmu-raster', b'image/x-xbitmap', b'image/gif', b'image/x-portable-bitmap', b'image/jpeg', b'application/x-hdf', b'application/postscript', b'image/png', b'image/vnd.microsoft.icon', b'image/x-rgb', b'video/mpeg', b'image/x-ms-bmp', b'image/x-xpixmap', b'image/x-portable-graymap', b'image/x-portable-pixmap', b'image/tiff', b'application/pdf'])], verbose_name='Account photo'),
        ),
        migrations.AlterField(
            model_name='asset',
            name='pic',
            field=models.ImageField(blank=True, default=None, null=True, upload_to=functools.partial(nc.models.model_file_directory_path, *(), **{b'field': 'pic'}), validators=[nc.validators.FileSizeValidator(limit_value=2621440), nc.validators.MimeTypeValidator(allowed_mimetypes=[b'image/x-cmu-raster', b'image/x-xbitmap', b'image/gif', b'image/x-portable-bitmap', b'image/jpeg', b'application/x-hdf', b'application/postscript', b'image/png', b'image/vnd.microsoft.icon', b'image/x-rgb', b'video/mpeg', b'image/x-ms-bmp', b'image/x-xpixmap', b'image/x-portable-graymap', b'image/x-portable-pixmap', b'image/tiff', b'application/pdf'])], verbose_name='Asset photo'),
        ),
    ]
