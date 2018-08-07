from algoliasearch_django import algolia_engine, AlgoliaIndex
from django.conf import settings


class SecuredAlgoliaIndex(AlgoliaIndex):
    """
    Override AlgoliaIndex to include method that produces
    secured search API key based on index's privacy requirements.
    """
    def get_secured_api_key(self, request):
        """
        Returns secured search api key from given request according to
        privacy requirements of this index.
        """
        return settings.ALGOLIA.get('SEARCH_API_KEY', '')


class ProfileIndex(SecuredAlgoliaIndex):
    fields = ('username', 'full_name', 'pic_url', 'href', 'bio', 'followers_count')
    settings = {
        'searchableAttributes': ['username', 'full_name', 'bio'],
        'customRanking': ['desc(followers_count)'],
        'highlightPreTag': '<mark>',
        'highlightPostTag': '</mark>',
    }


class AccountIndex(SecuredAlgoliaIndex):
    fields = ('public_key', 'username', 'name', 'pic_url', 'href', 'user_full_name',
        'user_pic_url', 'profile_is_private', 'viewable_by_if_private')
    settings = {
        'searchableAttributes': ['public_key', 'username', 'user_full_name', 'name'],
        'attributesForFaceting': ['profile_is_private', 'viewable_by_if_private'],
        'highlightPreTag': '<mark>',
        'highlightPostTag': '</mark>',
    }

    def get_secured_api_key(self, request):
        """
        Include privacy filter on profile. If profile associated with account
        is private, only associated profile and followers of associated profile
        can see account.
        """
        base_api_key = settings.ALGOLIA.get('SEARCH_API_KEY', '')
        viewable_by = request.user.id if request.user.is_authenticated else 0
        query_params = {
            'filters': 'profile_is_private:0 OR viewable_by_if_private:%s' % viewable_by,
        }
        return algolia_engine.client.generate_secured_api_key(base_api_key, query_params)


class AssetIndex(SecuredAlgoliaIndex):
    fields = ('code', 'issuer_address', 'issuer_handle', 'domain', 'pic_url', 'href')
    settings = {
        'searchableAttributes': ['code', 'domain', 'issuer_handle', 'issuer_address'],
        'highlightPreTag': '<mark>',
        'highlightPostTag': '</mark>',
    }
