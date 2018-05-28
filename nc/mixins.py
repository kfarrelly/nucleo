import algoliasearch_django

from django.conf import settings
from django.db.models import prefetch_related_objects
from django.http import JsonResponse
from django.views.generic.detail import SingleObjectMixin


class PrefetchedSingleObjectMixin(SingleObjectMixin):
    """
    Override to allow for prefetching of related fields.
    """
    prefetch_related_lookups = []

    def get_object(self, queryset=None):
        object = super(PrefetchedSingleObjectMixin, self).get_object(queryset)
        prefetch_related_objects([object], *self.prefetch_related_lookups)
        return object


class AjaxableResponseMixin(object):
    """
    Mixin to add AJAX support to a form.
    Must be used with an object-based FormView (e.g. CreateView)
    https://docs.djangoproject.com/en/2.0/topics/class-based-views/generic-editing/#ajax-example
    """
    def form_invalid(self, form):
        response = super(AjaxableResponseMixin, self).form_invalid(form)
        if self.request.is_ajax():
            return JsonResponse(form.errors, status=400)
        else:
            return response

    def form_valid(self, form):
        # We make sure to call the parent's form_valid() method because
        # it might do some processing (in the case of CreateView, it will
        # call form.save() for example).
        response = super(AjaxableResponseMixin, self).form_valid(form)

        # TODO: Add more to the data to be returned!
        if self.request.is_ajax():
            data = {
                'pk': self.object.pk,
            }
            return JsonResponse(data)
        else:
            return response


class JSONResponseMixin:
    """
    A mixin that can be used to render a JSON response.
    """
    def render_to_json_response(self, context, **response_kwargs):
        """
        Returns a JSON response, transforming 'context' to make the payload.
        """
        return JsonResponse(
            self.get_data(context),
            **response_kwargs
        )

    def get_data(self, context):
        """
        Returns an object that will be serialized as JSON by json.dumps().
        """
        # Note: This is *EXTREMELY* naive; in reality, you'll need
        # to do much more complex handling to ensure that arbitrary
        # objects -- such as Django model instances or querysets
        # -- can be serialized as JSON.
        # NOTE: This will work for our simple implementation when reporting
        # GET results from the Stellar network using python client
        return context


class IndexContextMixin(object):
    """
    A mixin that adds index search constants to the context data.
    """
    def get_context_data(self, **kwargs):
        kwargs = super(IndexContextMixin, self).get_context_data(**kwargs)
        kwargs.update({
            'index_app_id': settings.ALGOLIA.get('APPLICATION_ID'),
            'index_search_api_key': settings.ALGOLIA.get('SEARCH_API_KEY'),
            'index_names': {
                model.__name__: algoliasearch_django.get_adapter(model).index_name
                for model in algoliasearch_django.get_registered_model()
            },
        })
        return kwargs
