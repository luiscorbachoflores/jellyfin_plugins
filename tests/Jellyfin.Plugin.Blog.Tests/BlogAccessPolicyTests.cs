using Jellyfin.Plugin.Blog.Api;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Xunit;

namespace Jellyfin.Plugin.Blog.Tests;

public class BlogAccessPolicyTests
{
    private const string Author = "11111111-1111-1111-1111-111111111111";
    private const string Other = "22222222-2222-2222-2222-222222222222";

    [Fact]
    public void Authenticated_Allows()
    {
        Assert.Null(BlogAccessPolicy.CheckAuthenticated(true, false, true));
    }

    [Theory]
    [InlineData(false, false, true)]
    [InlineData(true, true, true)]
    [InlineData(true, false, false)]
    [InlineData(false, true, false)]
    public void NoSessionApiKeyOrNoUser_Is401(bool isAuth, bool isApiKey, bool hasUser)
    {
        Assert.IsType<UnauthorizedResult>(BlogAccessPolicy.CheckAuthenticated(isAuth, isApiKey, hasUser));
    }

    [Fact]
    public void Edit_OnlyAuthor()
    {
        Assert.True(BlogAccessPolicy.CanEdit(Author, Author));
        Assert.False(BlogAccessPolicy.CanEdit(Other, Author));
        Assert.Null(BlogAccessPolicy.CheckEdit(Author, Author));
        var forbidden = Assert.IsType<StatusCodeResult>(BlogAccessPolicy.CheckEdit(Other, Author));
        Assert.Equal(StatusCodes.Status403Forbidden, forbidden.StatusCode);
    }

    [Fact]
    public void Delete_AuthorOrAdmin_NotOthers()
    {
        Assert.True(BlogAccessPolicy.CanDelete(Author, Author, false));
        Assert.True(BlogAccessPolicy.CanDelete(Other, Author, true));
        Assert.False(BlogAccessPolicy.CanDelete(Other, Author, false));
        Assert.Null(BlogAccessPolicy.CheckDelete(Other, Author, true));
        var forbidden = Assert.IsType<StatusCodeResult>(BlogAccessPolicy.CheckDelete(Other, Author, false));
        Assert.Equal(StatusCodes.Status403Forbidden, forbidden.StatusCode);
    }

    [Fact]
    public void SameUser_IgnoresGuidFormat()
    {
        Assert.True(BlogAccessPolicy.SameUser(Author, Author.Replace("-", "")));
        Assert.True(BlogAccessPolicy.SameUser(Author, Author.ToUpperInvariant()));
        Assert.False(BlogAccessPolicy.SameUser(Author, Other));
        Assert.False(BlogAccessPolicy.SameUser(null, null));
        Assert.False(BlogAccessPolicy.SameUser("", ""));
    }

    [Fact]
    public void AdminIsNotAuthorForEditing()
    {
        // El admin que no es autor puede borrar pero no editar.
        Assert.False(BlogAccessPolicy.CanEdit(Other, Author));
        Assert.True(BlogAccessPolicy.CanDelete(Other, Author, true));
    }
}
