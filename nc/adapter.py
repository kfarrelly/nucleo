from allauth.account.adapter import DefaultAccountAdapter

from .models import Asset, Portfolio, Profile


class AccountAdapter(DefaultAccountAdapter):
    """
    Extension of the allauth.account default adapter.
    """
    def save_user(self, request, user, form):
        """
        Saves a new `User` instance using information provided in the
        signup form.

        Extends to create a profile and portfolio for this new user and to note
        that XLM is always a trusted asset.
        """
        user = super(AccountAdapter, self).save_user(request, user, form)
        profile = Profile.objects.create(user=user)
        portfolio = Portfolio.objects.create(profile=profile)
        return user

    def send_mail_to_many(self, template_prefix, recipient_list, context):
        msg = self.render_mass_mail(template_prefix, recipient_list, context)
        msg.send()

    def render_mail_to_many(self, template_prefix, recipient_list, context):
        """
        Extends allauth adapter.render_mail to account for multiple recipients.

        See: https://github.com/pennersr/django-allauth/blob/master/allauth/account/adapter.py
        """
        # Use a placeholder value for the email message, then replace
        # msg.to attribute to full recipient list
        msg = self.render_mail(template_prefix, recipient_list[0], context)
        msg.to = recipient_list
        return msg


    # TODO: in form (like with passwordresetform), send out mail to many
    # see: https://github.com/pennersr/django-allauth/blob/master/allauth/account/forms.py
