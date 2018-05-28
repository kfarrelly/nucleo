from algoliasearch_django import AlgoliaIndex


class ProfileIndex(AlgoliaIndex):
    fields = ('username', 'full_name', 'pic', 'bio', 'followers_count')
    settings = {
        'searchableAttributes': ['username', 'full_name', 'bio'],
        'customRanking': ['desc(followers_count)'], # TODO: eventually include trading performance rank
        'highlightPreTag': '<mark>',
        'highlightPostTag': '</mark>',
    }

class AccountIndex(AlgoliaIndex):
    fields = ('public_key', 'username', 'name', 'pic')
    settings = {
        'searchableAttributes': ['public_key', 'name'],
        'highlightPreTag': '<mark>',
        'highlightPostTag': '</mark>',
    }
