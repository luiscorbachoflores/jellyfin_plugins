using Jellyfin.Plugin.AdminMessages.Api;
using Xunit;

namespace Jellyfin.Plugin.AdminMessages.Tests;

public class LinkPolicyTests
{
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void EmptyLink_IsAcceptedAsNoLink(string? raw)
    {
        Assert.True(LinkPolicy.TryNormalize(raw, out var link, out var error));
        Assert.Null(link);
        Assert.Null(error);
    }

    [Fact]
    public void HttpsLink_IsAccepted()
    {
        Assert.True(LinkPolicy.TryNormalize("  https://recap.titoteca.net/2026  ", out var link, out _));
        Assert.Equal("https://recap.titoteca.net/2026", link);
    }

    [Theory]
    [InlineData("javascript:alert(1)")]
    [InlineData("data:text/html,<script>alert(1)</script>")]
    [InlineData("ftp://example.com/file")]
    [InlineData("/relative/path")]
    [InlineData("not a url")]
    public void NonHttpOrRelativeLink_IsRejected(string raw)
    {
        Assert.False(LinkPolicy.TryNormalize(raw, out var link, out var error));
        Assert.Null(link);
        Assert.Equal(LinkPolicy.InvalidLinkMessage, error);
    }

    [Fact]
    public void QuoteInLink_CannotBreakOutOfHrefAttribute()
    {
        // .NET acepta esta URL como http(s) válida; lo que importa es que sale normalizada,
        // sin comillas ni espacios literales que cierren el atributo href en el cliente.
        Assert.True(LinkPolicy.TryNormalize("https://example.com/x\" onmouseover=\"alert(1)", out var link, out _));
        Assert.DoesNotContain("\"", link);
        Assert.DoesNotContain(" ", link);
        Assert.DoesNotContain("<", link);
    }
}
