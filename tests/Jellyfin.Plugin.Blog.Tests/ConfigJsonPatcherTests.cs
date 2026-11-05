using System.Text.Json.Nodes;
using Jellyfin.Plugin.Blog.Web;
using Xunit;

namespace Jellyfin.Plugin.Blog.Tests;

public class ConfigJsonPatcherTests
{
    private const string Original = "{\"includeCorsOrigin\":true,\"themes\":[{\"name\":\"Dark\",\"id\":\"dark\"}],\"menuLinks\":[{\"name\":\"Ayuda\",\"icon\":\"help\",\"url\":\"https://example.org/ayuda\"}]}";

    private static JsonArray Links(string json) => JsonNode.Parse(json)!.AsObject()["menuLinks"]!.AsArray();

    [Fact]
    public void AddsLink_AndKeepsExistingLinksAndProperties()
    {
        var result = ConfigJsonPatcher.Patch(Original, true);
        var root = JsonNode.Parse(result)!.AsObject();
        var links = root["menuLinks"]!.AsArray();

        Assert.Equal(2, links.Count);
        Assert.Equal("Ayuda", (string?)links[0]!["name"]);
        Assert.Equal("https://example.org/ayuda", (string?)links[0]!["url"]);
        Assert.Equal("Blog", (string?)links[1]!["name"]);
        Assert.Equal("article", (string?)links[1]!["icon"]);
        Assert.Equal("#/blog", (string?)links[1]!["url"]);
        Assert.True((bool)root["includeCorsOrigin"]!);
        Assert.Equal("dark", (string?)root["themes"]![0]!["id"]);
    }

    [Fact]
    public void CreatesMenuLinks_WhenMissing()
    {
        var result = ConfigJsonPatcher.Patch("{\"themes\":[]}", true);
        var links = Links(result);
        Assert.Single(links);
        Assert.Equal("#/blog", (string?)links[0]!["url"]);
        Assert.NotNull(JsonNode.Parse(result)!["themes"]);
    }

    [Fact]
    public void CreatesMenuLinks_WhenNull()
    {
        var links = Links(ConfigJsonPatcher.Patch("{\"menuLinks\":null}", true));
        Assert.Single(links);
    }

    [Fact]
    public void EmptyObject_GetsMenuLinks()
    {
        Assert.Single(Links(ConfigJsonPatcher.Patch("{}", true)));
    }

    [Fact]
    public void DoesNotDuplicate_WhenAlreadyPresent()
    {
        var once = ConfigJsonPatcher.Patch(Original, true);
        var twice = ConfigJsonPatcher.Patch(once, true);
        Assert.Equal(once, twice);
        Assert.Equal(2, Links(twice).Count);
    }

    [Fact]
    public void DoesNotDuplicate_WhenAdminAddedItByHand()
    {
        const string manual = "{\"menuLinks\":[{\"name\":\"Mi blog\",\"icon\":\"forum\",\"url\":\"#/Blog\"}]}";
        Assert.Equal(manual, ConfigJsonPatcher.Patch(manual, true));
    }

    [Fact]
    public void ShowInMenuFalse_ReturnsInputUnchanged()
    {
        Assert.Equal(Original, ConfigJsonPatcher.Patch(Original, false));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("not json")]
    [InlineData("{\"a\":")]
    [InlineData("[1,2,3]")]
    [InlineData("\"texto\"")]
    [InlineData("42")]
    [InlineData("null")]
    public void NotAJsonObject_ReturnsInputUnchanged(string input)
    {
        Assert.Equal(input, ConfigJsonPatcher.Patch(input, true));
    }

    [Fact]
    public void MenuLinksNotAnArray_ReturnsInputUnchanged()
    {
        const string weird = "{\"menuLinks\":\"nope\"}";
        Assert.Equal(weird, ConfigJsonPatcher.Patch(weird, true));
    }

    [Fact]
    public void NonAsciiCharactersAreNotEscaped()
    {
        var result = ConfigJsonPatcher.Patch("{\"menuLinks\":[{\"name\":\"Películas\",\"icon\":\"movie\",\"url\":\"#/x\"}]}", true);
        Assert.Contains("Películas", result);
    }

    [Fact]
    public void MalformedLinkEntries_AreTolerated()
    {
        var links = Links(ConfigJsonPatcher.Patch("{\"menuLinks\":[1,null,{\"name\":\"x\"},{\"url\":5}]}", true));
        Assert.Equal(5, links.Count);
        Assert.Equal("#/blog", (string?)links[4]!["url"]);
    }
}
