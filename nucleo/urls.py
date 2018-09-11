"""nucleo URL Configuration

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/1.11/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  url(r'^$', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  url(r'^$', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.conf.urls import url, include
    2. Add a URL to urlpatterns:  url(r'^blog/', include('blog.urls'))
"""
from django.conf import settings
from django.conf.urls.static import static
from django.conf.urls import include, url
from django.contrib import admin
from django.views.generic.base import TemplateView

from nc import views as nc_views

urlpatterns = [
    # Web urls
    url(r'^$', TemplateView.as_view(template_name='index.html'), name='home'),
    url(r'^', include('nc.urls')),
    url(r'^admin/', admin.site.urls),

    ## Allauth
    ### Override of account_change_password and additional signup flow
    url(r'^accounts/password/change/$', nc_views.PasswordChangeView.as_view(), name='account_change_password'),
    url(r'^accounts/signup/stellar/update/$', nc_views.SignupStellarUpdateView.as_view(), name='account-signup-stellar-update'),
    url(r'^accounts/signup/profile/update/$', nc_views.SignupUserUpdateView.as_view(), name='account-signup-user-update'),
    url(r'^accounts/signup/profile/following/update/$', nc_views.SignupUserFollowingUpdateView.as_view(), name='account-signup-following-update'),
    url(r'^accounts/', include('allauth.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
