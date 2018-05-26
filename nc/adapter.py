from allauth.account.adapter import DefaultAccountAdapter

from .models import Profile


class AccountAdapter(DefaultAccountAdapter):
    """
    Extension of the allauth.account default adapter.
    """
    def save_user(self, request, user, form):
        """
        Saves a new `User` instance using information provided in the
        signup form.

        Extends to create a profile for this new user.
        """
        user = super(AccountAdapter, self).save_user(request, user, form)
        Profile.objects.create(user=user)
        return user
