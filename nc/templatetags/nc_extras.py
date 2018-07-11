import re

from datetime import datetime

from django.conf import settings
from django.template.defaulttags import register
from django.template.defaultfilters import timesince_filter


@register.filter
def get_item(dictionary, key):
    return dictionary.get(key)

@register.filter
def get_attribute(value, arg):
    """
    See: https://stackoverflow.com/questions/844746/performing-a-getattr-style-lookup-in-a-django-template
    """
    if hasattr(value, str(arg)):
        return getattr(value, arg)
    elif hasattr(value, 'has_key') and value.has_key(arg):
        return value[arg]
    elif re.compile("^\d+$").match(str(arg)) and len(value) > int(arg):
        return value[int(arg)]
    else:
        return ''

@register.filter
def create_tuple(arg1, arg2):
    return (arg1, arg2)

@register.filter
def percentage(value):
    return format(float(value), ".2%")
