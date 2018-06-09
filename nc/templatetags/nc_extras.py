from datetime import datetime

from django.template.defaulttags import register
from django.template.defaultfilters import timesince_filter


@register.filter
def get_item(dictionary, key):
    return dictionary.get(key)

@register.filter
def create_tuple(arg1, arg2):
    return (arg1, arg2)
