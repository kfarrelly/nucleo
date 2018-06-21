from algoliasearch_django import AlgoliaIndex


class ProfileIndex(AlgoliaIndex):
    fields = ('username', 'full_name', 'pic_url', 'href', 'bio', 'followers_count')
    settings = {
        'searchableAttributes': ['username', 'full_name', 'bio'],
        'customRanking': ['desc(followers_count)'], # TODO: eventually include trading performance rank
        'highlightPreTag': '<mark>',
        'highlightPostTag': '</mark>',
    }

class AccountIndex(AlgoliaIndex):
    fields = ('public_key', 'username', 'user_full_name', 'name', 'pic_url', 'href')
    settings = {
        'searchableAttributes': ['public_key', 'username', 'user_full_name', 'name'],
        'highlightPreTag': '<mark>',
        'highlightPostTag': '</mark>',
    }

class AssetIndex(AlgoliaIndex):
    fields = ('code', 'issuer_address', 'issuer_handle', 'domain', 'pic_url', 'href')
    settings = {
        'searchableAttributes': ['code', 'domain', 'issuer_handle', 'issuer_address'],
        'highlightPreTag': '<mark>',
        'highlightPostTag': '</mark>',
    }
