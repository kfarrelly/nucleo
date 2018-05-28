"""
Django settings for nucleo project.

Generated by 'django-admin startproject' using Django 1.11.7.

For more information on this file, see
https://docs.djangoproject.com/en/1.11/topics/settings/

For the full list of settings and their values, see
https://docs.djangoproject.com/en/1.11/ref/settings/
"""

import boto3, os

from base64 import b64decode

from stellar_base import horizon, keypair


# Build paths inside the project like this: os.path.join(BASE_DIR, ...)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/1.11/howto/deployment/checklist/

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY')

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = True

ENV_TYPE = os.environ.get('ENV_TYPE') # to distinguish between dev v.s. prod
ENV_NAME = os.environ.get('ENV_NAME') # to distinguish between web v.s. work(er)

if ENV_TYPE == 'dev' or ENV_NAME == 'work':
    # Localhost set for aws worker tier and HTTP needed
    ALLOWED_HOSTS = [ ]
else:
    # Otherwise, usual django settings with HTTPS
    ALLOWED_HOSTS = [ '.nucleo.fi' ]

    # PROD SECURITY
    CSRF_COOKIE_SECURE = True
    SESSION_COOKIE_SECURE = True

    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

    SECURE_CONTENT_TYPE_NOSNIFF = True
    SECURE_BROWSER_XSS_FILTER = True
    SECURE_SSL_REDIRECT = True

    CSRF_COOKIE_HTTPONLY = True
    X_FRAME_OPTIONS = 'DENY'


# For debug available in template context
INTERNAL_IPS = [ '127.0.0.1' ]


# Application definition

INSTALLED_APPS = [
    'nc.apps.NcConfig',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.humanize',
    'django.contrib.sites',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'djangobower',
    'rest_framework',
    'rest_framework.authtoken',
    'bootstrapform',
    'bootstrap3',
    'allauth',
    'allauth.account',
    'allauth.socialaccount',
    'betterforms',
    'algoliasearch_django',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'nucleo.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'nucleo.wsgi.application'


# Database
# https://docs.djangoproject.com/en/1.11/ref/settings/#databases

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': os.path.join(BASE_DIR, 'db.sqlite3'),
    }
}


# Password validation
# https://docs.djangoproject.com/en/1.11/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

# Allauth
LOGIN_REDIRECT_URL = '/profile/'
AUTHENTICATION_BACKENDS = (
    'django.contrib.auth.backends.ModelBackend',
    'allauth.account.auth_backends.AuthenticationBackend',
)
# All-auth account authentication
ACCOUNT_ADAPTER = 'nc.adapter.AccountAdapter'
ACCOUNT_EMAIL_REQUIRED = True
ACCOUNT_AUTHENTICATION_METHOD = 'username_email'
ACCOUNT_EMAIL_VERIFICATION = "mandatory"
ACCOUNT_LOGIN_ON_EMAIL_CONFIRMATION = True
ACCOUNT_SIGNUP_PASSWORD_ENTER_TWICE = False
ACCOUNT_SESSION_REMEMBER = False
ACCOUNT_DEFAULT_HTTP_PROTOCOL = 'http'


# Internationalization
# https://docs.djangoproject.com/en/1.11/topics/i18n/

LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'UTC'

USE_I18N = True

USE_L10N = True

USE_TZ = True


# Email
EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/1.11/howto/static-files/

STATIC_URL = '/static/'
STATIC_ROOT = os.path.join(BASE_DIR, 'static')
STATICFILES_FINDERS = [
    'django.contrib.staticfiles.finders.FileSystemFinder',
    'django.contrib.staticfiles.finders.AppDirectoriesFinder',
    'djangobower.finders.BowerFinder',
]

# Media files
MEDIA_URL = '/media/'
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')

# Sites Framework
SITE_ID = 1

# Bower
BOWER_COMPONENTS_ROOT = BASE_DIR + '/components/'
BOWER_INSTALLED_APPS = (
    'stellar-sdk',
    'js-cookie',
    'moment',
    'numeral',
    'ladda-bootstrap',
)

# Algolia
ALGOLIA = {
    'APPLICATION_ID': os.environ.get('ALGOLIA_APPLICATION_ID'),
    'API_KEY': os.environ.get('ALGOLIA_API_KEY'),
    'SEARCH_API_KEY': os.environ.get('ALGOLIA_SEARCH_API_KEY'),
    'INDEX_SUFFIX': ENV_TYPE,
}

# AWS
AWS_ACCESS_KEY_ID = os.environ.get('AWS_ACCESS_KEY_ID')
AWS_SECRET_ACCESS_KEY = os.environ.get('AWS_SECRET_ACCESS_KEY')

# Initialize a client for decrypting sensitive environment vars
# https://dzone.com/articles/aws-lambda-encrypted-environment-variables
kms_client = boto3.client(
    'kms',
    aws_access_key_id=AWS_ACCESS_KEY_ID,
    aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
)

# Stellar
STELLAR_ISSUING_KEY_PAIR = keypair.Keypair.from_seed(
    kms_client.decrypt(
        CiphertextBlob=b64decode(os.environ.get('STELLAR_ENCRYPTED_ISSUING_SECRET_SEED'))
    )['Plaintext']
)
STELLAR_BASE_KEY_PAIR = keypair.Keypair.from_seed(
    kms_client.decrypt(
        CiphertextBlob=b64decode(os.environ.get('STELLAR_ENCRYPTED_BASE_SECRET_SEED'))
    )['Plaintext']
)
STELLAR_DATA_VERIFICATION_KEY = 'nucleo_signed_user'

# Nucleo covers 1 data entry + 1 trustline for user's first account
# NOTE: https://www.stellar.org/developers/guides/concepts/fees.html
STELLAR_CREATE_ACCOUNT_QUOTA = 1
STELLAR_CREATE_ACCOUNT_MINIMUM_BALANCE = '2'
if DEBUG:
    STELLAR_HORIZON = horizon.HORIZON_TEST
    STELLAR_HORIZON_INITIALIZATION_METHOD = horizon.horizon_testnet
    STELLAR_NETWORK = 'TESTNET'
else:
    STELLAR_HORIZON = horizon.HORIZON_LIVE
    STELLAR_HORIZON_INITIALIZATION_METHOD = horizon.horizon_livenet
    STELLAR_NETWORK = 'PUBLIC'
