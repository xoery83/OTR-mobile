import ExpoModulesCore
import GoogleSignIn

public class OtrGoogleSignInModule: Module {
  private var signingIn = false
  private let cancelledCode = -5 // kGIDSignInErrorCodeCanceled in pinned GoogleSignIn 9.2.0.

  public func definition() -> ModuleDefinition {
    Name("OtrGoogleSignIn")

    AsyncFunction("signIn") { (iosClientId: String, webClientId: String, nonceDigest: String, promise: Promise) in
      guard !self.signingIn else {
        promise.reject("GOOGLE_SIGN_IN_IN_PROGRESS", "Google sign-in is in progress.")
        return
      }
      guard nonceDigest.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
        let presenter = self.appContext?.utilities?.currentViewController() else {
        promise.reject("GOOGLE_SIGN_IN_UNAVAILABLE", "Google sign-in cannot start.")
        return
      }
      self.signingIn = true
      GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: iosClientId, serverClientID: webClientId)
      GIDSignIn.sharedInstance.signIn(withPresenting: presenter, hint: nil, additionalScopes: nil, nonce: nonceDigest) { result, error in
        self.signingIn = false
        if let error = error as NSError? {
          if error.domain == kGIDSignInErrorDomain && error.code == self.cancelledCode {
            promise.resolve(["type": "cancelled"])
          } else {
            promise.reject("GOOGLE_SIGN_IN_FAILED", "Google sign-in failed.")
          }
          return
        }
        guard let token = result?.user.idToken?.tokenString, !token.isEmpty else {
          promise.reject("GOOGLE_ID_TOKEN_MISSING", "Google did not return an ID token.")
          return
        }
        promise.resolve(["type": "success", "data": ["idToken": token]])
      }
    }.runOnQueue(.main)
  }
}
