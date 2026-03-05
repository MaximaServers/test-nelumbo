import { UserModel } from './user.entity';

export const authService = {
    async findByEmail(email: string) {
        return UserModel.findOne({ email });
    }
};
