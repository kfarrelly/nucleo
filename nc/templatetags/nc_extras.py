from django.template.defaulttags import register


@register.filter
def get_item(dictionary, key):
    return dictionary.get(key)

@register.filter
def create_tuple(arg1, arg2):
    return (arg1, arg2)
