from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import (
    FileExtensionValidator, MaxValueValidator, get_available_image_extensions
)
from django.template.defaultfilters import filesizeformat
from django.utils.deconstruct import deconstructible
from django.utils.translation import gettext_lazy as _

import magic, mimetypes

# File extension
validate_pdf_file_extension = FileExtensionValidator(allowed_extensions=['pdf'])

# File size
@deconstructible
class FileSizeValidator(MaxValueValidator):
    """
    limit_value is in bytes.
    """
    message = _(
        "File size of %(formatted_show_value)s is not allowed. "
        "Ensure file size is less than or equal to %(formatted_limit_value)s."
    )
    code = 'max_size'

    def __call__(self, value):
        cleaned = self.clean(value)
        params = {
            'limit_value': self.limit_value,
            'formatted_limit_value': filesizeformat(self.limit_value),
            'show_value': cleaned,
            'formatted_show_value': filesizeformat(cleaned),
            'value': value
        }
        if self.compare(cleaned, self.limit_value):
            raise ValidationError(self.message, code=self.code, params=params)

    def clean(self, x):
        """
        Return file size for the comparison with limit_value.
        """
        return x.size

# Require files to be less than max upload size
validate_file_size = FileSizeValidator(
    limit_value=settings.DATA_UPLOAD_MAX_MEMORY_SIZE,
)

# File type
@deconstructible
class MimeTypeValidator(object):
    message = _(
        "File type of %(mime)s is not allowed. "
        "Ensure file type is either %(allowed_mimetypes)s."
    )
    code = 'mime_type'

    def __init__(self, allowed_mimetypes=None, message=None, code=None):
        self.allowed_mimetypes = allowed_mimetypes
        if message is not None:
            self.message = message
        if code is not None:
            self.code = code

    def __call__(self, value):
        try:
            mime = magic.from_buffer(value.read(1024), mime=True)
            if not mime in self.allowed_mimetypes:
                raise ValidationError(
                    self.message,
                    code=self.code,
                    params={
                        'mime': mime,
                        'allowed_mimetypes': ', '.join(self.allowed_mimetypes)
                    }
                )
        except AttributeError as e:
            raise ValidationError('The file type for this upload could not be validated')


def get_available_image_mimetypes():
    # Extensions from Pillow
    return list(set([ mimetypes.types_map['.{0}'.format(ext)]
        for ext in get_available_image_extensions()
        if '.{0}'.format(ext) in mimetypes.types_map ]))

validate_image_mimetype = MimeTypeValidator(
    allowed_mimetypes=get_available_image_mimetypes(),
)

validate_pdf_mimetype = MimeTypeValidator(
    allowed_mimetypes=['application/pdf'],
)
