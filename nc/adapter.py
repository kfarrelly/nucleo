from allauth.account.adapter import DefaultAccountAdapter

from django.core.mail import send_mass_mail

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
        """
        Use django.core.mail.send_mass_mail() to bulk email.

        https://docs.djangoproject.com/en/2.0/topics/email/#send-mass-mail
        """
        # Reformat EmailMessage instances into list of tuples (subject, message, from_email, recipient_list)
        msgs = self.render_mail_to_many(template_prefix, recipient_list, context)
        datatuple = ( (msg.subject, msg.body, msg.from_email, msg.to) for msg in msgs )
        send_mass_mail(datatuple)

    def render_mail_to_many(self, template_prefix, recipient_list, context):
        """
        Extends allauth adapter.render_mail to account for multiple recipients.

        Returns iterable of email messages to be sent out.

        See: https://github.com/pennersr/django-allauth/blob/master/allauth/account/adapter.py
        """
        msgs = [
            self.render_mail(template_prefix, recipient, context)
            for recipient in recipient_list
        ]
        return msgs
