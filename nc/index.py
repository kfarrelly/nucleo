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
    fields = ('public_key', 'username', 'name', 'pic_url', 'href')
    settings = {
        'searchableAttributes': ['public_key', 'username', 'name'],
        'highlightPreTag': '<mark>',
        'highlightPostTag': '</mark>',
    }
