using Jellyfin.Plugin.Watchlist.Api;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Xunit;

namespace Jellyfin.Plugin.Watchlist.Tests;

public class WatchlistRulesTests
{
    [Theory]
    [InlineData("Movie", true)]
    [InlineData("Series", true)]
    [InlineData("Episode", false)]
    [InlineData("Season", false)]
    [InlineData("Audio", false)]
    [InlineData("MusicAlbum", false)]
    [InlineData("BoxSet", false)]
    [InlineData("movie", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    public void IsEligibleKind_OnlyMovieAndSeries(string? kind, bool expected)
    {
        Assert.Equal(expected, WatchlistRules.IsEligibleKind(kind));
    }

    [Theory]
    [InlineData(true, "Movie", true, true)]
    [InlineData(true, "Series", true, true)]
    [InlineData(false, "Movie", true, false)]
    [InlineData(true, "Movie", false, false)]
    [InlineData(true, "Episode", true, false)]
    public void IsEligible_RequiresExistenceKindAndVisibility(bool exists, string kind, bool visible, bool expected)
    {
        Assert.Equal(expected, WatchlistRules.IsEligible(exists, kind, visible));
    }

    [Fact]
    public void Limit_Is500()
    {
        Assert.Equal(500, WatchlistRules.MaxEntriesPerUser);
    }

    [Fact]
    public void AccessPolicy_Anonymous_Returns401()
    {
        var result = WatchlistAccessPolicy.CheckAuthenticated(false);

        Assert.IsType<UnauthorizedResult>(result);
        Assert.Equal(StatusCodes.Status401Unauthorized, ((UnauthorizedResult)result!).StatusCode);
    }

    [Fact]
    public void AccessPolicy_ApiKeyWithoutUser_Returns401()
    {
        Assert.IsType<UnauthorizedResult>(WatchlistAccessPolicy.CheckAuthenticated(true, isApiKey: true));
    }

    [Fact]
    public void AccessPolicy_AuthenticatedUser_IsAllowed()
    {
        Assert.Null(WatchlistAccessPolicy.CheckAuthenticated(true));
    }

    [Fact]
    public void AccessPolicy_AuthenticatedWithoutUser_Returns401()
    {
        Assert.IsType<UnauthorizedResult>(WatchlistAccessPolicy.CheckAuthenticated(true, isApiKey: false, hasUser: false));
    }
}
